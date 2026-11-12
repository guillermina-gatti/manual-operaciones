/* Use case of the procedures metrics panel (HU38): executions per procedure, average
time per step and abandonment per step, filtered by area and period */
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { AuthUser } from '../../common/auth';
import { AreasDirectory } from '../../documents/ports/areas-directory';
import { UsersDirectory } from '../../documents/ports/users-directory';
import { toHttpException } from '../http-errors';
import { Clock } from '../ports/clock';
import { ProceduresCatalog } from '../ports/procedures-catalog';
import { activeAreaIdsOf } from '../viewer-areas';
import { ExecutionMetricsRepository } from './execution-metrics.repository';
import {
  filterableAreaIds,
  inScope,
  metricsScope,
} from './metrics-access.policy';
import {
  DEFAULT_TIME_ZONE,
  STALE_AFTER_HOURS,
  staleBefore,
  toMetricsPeriod,
} from './metrics-period';
import {
  areaSummaryOf,
  buildProcedureMetrics,
  MetricsTotals,
  ProcedureMetrics,
  totalsOf,
} from './procedure-metrics';
import type { AreaSummary } from './procedure-metrics';
import { findVisibleVersions } from './visible-versions';

// Already validated by the DTO: from and to are "YYYY-MM-DD" days that exist.
export interface ProcedureMetricsQuery {
  areaId?: string;
  from?: string;
  to?: string;
}

export interface ProcedureMetricsView {
  filters: { areaId: string | null; from: string | null; to: string | null };
  staleAfterHours: number;
  areaIds: string[] | null; // the areas the viewer may filter by; null: any
  totals: MetricsTotals;
  procedures: ProcedureMetrics[];
  // Procedures per area of everything the viewer may see, whatever areaId says.
  areaSummary: AreaSummary[];
}

// The same answer for an area that is not the supervisor's and one that does not
// exist for them.
const areaNotFound = () => new NotFoundException('No se encontró el área');

@Injectable()
export class ProcedureMetricsService {
  private readonly logger = new Logger(ProcedureMetricsService.name);
  private readonly timeZone = process.env.APP_TIMEZONE || DEFAULT_TIME_ZONE;

  constructor(
    private readonly users: UsersDirectory,
    private readonly areas: AreasDirectory,
    private readonly catalog: ProceduresCatalog,
    private readonly metrics: ExecutionMetricsRepository,
    private readonly clock: Clock,
  ) {}

  async procedures(
    user: AuthUser,
    query: ProcedureMetricsQuery,
  ): Promise<ProcedureMetricsView> {
    try {
      return await this.build(user, query);
    } catch (error) {
      throw toHttpException(error, this.logger, 'metrics');
    }
  }

  private async build(
    user: AuthUser,
    { areaId, from, to }: ProcedureMetricsQuery,
  ): Promise<ProcedureMetricsView> {
    // "YYYY-MM-DD" sorts like the dates it represents.
    if (from && to && from > to) {
      throw new BadRequestException(
        'La fecha de inicio no puede ser posterior a la fecha de fin',
      );
    }

    // Only the active areas of the viewer, read on every request (viewer-areas.ts). The
    // ADMIN scope does not depend on them, so it keeps every area.
    const viewerAreaIds = await activeAreaIdsOf(
      this.users,
      this.areas,
      user.id,
    );
    const scope = metricsScope(user.role, viewerAreaIds, areaId);
    if (!scope) throw areaNotFound();

    const aggregates = await this.metrics.aggregate({
      ...toMetricsPeriod(from, to, this.timeZone),
      staleBefore: staleBefore(this.clock.now()),
    });
    // The versions of everything the viewer may see, without the area filter: the area
    // summary needs them. The ones of the requested scope come out of them, so the
    // catalog is asked once per version.
    const viewerScope = metricsScope(user.role, viewerAreaIds) ?? scope;
    const viewerVersions = await findVisibleVersions(
      this.catalog,
      this.logger,
      aggregates.executions.map((e) => e.procedureVersionId),
      viewerScope,
    );
    const versions = new Map(
      [...viewerVersions].filter(([, version]) =>
        inScope(scope, version.areaIds),
      ),
    );
    const procedures = buildProcedureMetrics(
      aggregates.executions,
      aggregates.steps,
      versions,
    );
    const filterable = filterableAreaIds(user.role, viewerAreaIds);

    return {
      filters: { areaId: areaId ?? null, from: from ?? null, to: to ?? null },
      staleAfterHours: STALE_AFTER_HOURS,
      areaIds: filterable,
      totals: totalsOf(procedures, aggregates.executions),
      procedures,
      areaSummary: areaSummaryOf(
        buildProcedureMetrics(
          aggregates.executions,
          aggregates.steps,
          viewerVersions,
        ),
        filterable,
      ),
    };
  }
}
