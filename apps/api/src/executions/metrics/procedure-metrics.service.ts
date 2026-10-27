/* Use case of the procedures metrics panel (HU38): executions per procedure, average
time per step and abandonment per step, filtered by area and period */
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { AuthUser } from '../../common/auth';
import { UsersDirectory } from '../../documents/ports/users-directory';
import { toHttpException } from '../http-errors';
import { Clock } from '../ports/clock';
import {
  CatalogProcedureVersion,
  ProceduresCatalog,
} from '../ports/procedures-catalog';
import { ExecutionMetricsRepository } from './execution-metrics.repository';
import {
  filterableAreaIds,
  inScope,
  metricsScope,
  MetricsScope,
} from './metrics-access.policy';
import {
  DEFAULT_TIME_ZONE,
  STALE_AFTER_HOURS,
  staleBefore,
  toMetricsPeriod,
} from './metrics-period';
import {
  buildProcedureMetrics,
  MetricsTotals,
  ProcedureMetrics,
  totalsOf,
} from './procedure-metrics';

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

    // Areas come from the directory on every request, never from the session.
    const viewerAreaIds = (await this.users.findById(user.id))?.areaIds ?? [];
    const scope = metricsScope(user.role, viewerAreaIds, areaId);
    if (!scope) throw areaNotFound();

    const aggregates = await this.metrics.aggregate({
      ...toMetricsPeriod(from, to, this.timeZone),
      staleBefore: staleBefore(this.clock.now()),
    });
    const versions = await this.visibleVersions(
      aggregates.executions.map((e) => e.procedureVersionId),
      scope,
    );
    const procedures = buildProcedureMetrics(
      aggregates.executions,
      aggregates.steps,
      versions,
    );

    return {
      filters: { areaId: areaId ?? null, from: from ?? null, to: to ?? null },
      staleAfterHours: STALE_AFTER_HOURS,
      areaIds: filterableAreaIds(user.role, viewerAreaIds),
      totals: totalsOf(procedures),
      procedures,
    };
  }

  // The versions with executions whose procedure is currently in the scope. A version
  // the catalog does not know is left out and logged: without it there are no steps
  // nor areas to check.
  private async visibleVersions(
    versionIds: string[],
    scope: MetricsScope,
  ): Promise<Map<string, CatalogProcedureVersion>> {
    const found = await Promise.all(
      [...new Set(versionIds)].map(async (versionId) => {
        const version = await this.catalog.findVersion(versionId);
        if (!version) {
          this.logger.warn({
            message:
              'Versión de procedimiento con ejecuciones que el catálogo no conoce',
            procedureVersionId: versionId,
          });
        }
        return version;
      }),
    );
    return new Map(
      found
        .filter((v): v is CatalogProcedureVersion => v !== null)
        .filter((v) => inScope(scope, v.areaIds))
        .map((v) => [v.versionId, v]),
    );
  }
}
