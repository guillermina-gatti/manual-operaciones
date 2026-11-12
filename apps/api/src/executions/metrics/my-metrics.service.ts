/* Use case of the personal metrics of the employee (GET /metrics/me): their own executions
in the period, with the same rules of areas, time zone, abandonment and errors as the
procedures metrics (HU38). The user always comes from the session: there is no way to ask
for someone else's metrics */
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
  DEFAULT_TIME_ZONE,
  STALE_AFTER_HOURS,
  staleBefore,
  toMetricsPeriod,
} from './metrics-period';
import {
  buildMyProcedures,
  buildResume,
  myAreaScope,
  myTotals,
} from './my-metrics';
import type { MyProcedure, MyResumeItem, MyTotals } from './my-metrics';
import type { ProcedureMetricsQuery } from './procedure-metrics.service';
import { findVisibleVersions } from './visible-versions';

export interface MyMetricsView {
  filters: { areaId: string | null; from: string | null; to: string | null };
  staleAfterHours: number;
  // The viewer's active areas: the ones they may filter by.
  areaIds: string[];
  totals: MyTotals;
  // Every execution in progress they can open again, whatever the period.
  resume: MyResumeItem[];
  procedures: MyProcedure[];
}

// The same answer for an area that is not the viewer's, an inactive one and one that
// does not exist.
const areaNotFound = () => new NotFoundException('No se encontró el área');

@Injectable()
export class MyMetricsService {
  private readonly logger = new Logger(MyMetricsService.name);
  private readonly timeZone = process.env.APP_TIMEZONE || DEFAULT_TIME_ZONE;

  constructor(
    private readonly users: UsersDirectory,
    private readonly areas: AreasDirectory,
    private readonly catalog: ProceduresCatalog,
    private readonly metrics: ExecutionMetricsRepository,
    private readonly clock: Clock,
  ) {}

  async mine(
    user: AuthUser,
    query: ProcedureMetricsQuery,
  ): Promise<MyMetricsView> {
    try {
      return await this.build(user, query);
    } catch (error) {
      throw toHttpException(error, this.logger, 'metrics');
    }
  }

  private async build(
    user: AuthUser,
    { areaId, from, to }: ProcedureMetricsQuery,
  ): Promise<MyMetricsView> {
    // "YYYY-MM-DD" sorts like the dates it represents.
    if (from && to && from > to) {
      throw new BadRequestException(
        'La fecha de inicio no puede ser posterior a la fecha de fin',
      );
    }

    // Only the active areas, read on every request (viewer-areas.ts).
    const viewerAreaIds = await activeAreaIdsOf(
      this.users,
      this.areas,
      user.id,
    );
    const areaIds = myAreaScope(viewerAreaIds, areaId);
    if (!areaIds) throw areaNotFound();

    const stale = staleBefore(this.clock.now());
    const aggregates = await this.metrics.mine(user.id, {
      ...toMetricsPeriod(from, to, this.timeZone),
      staleBefore: stale,
    });
    // The versions of the period and those of the executions to resume, in one lookup.
    const versions = await findVisibleVersions(
      this.catalog,
      this.logger,
      [
        ...aggregates.executions.map((e) => e.procedureVersionId),
        ...aggregates.inProgress.map((e) => e.procedureVersionId),
      ],
      { all: false, areaIds },
    );
    const procedures = buildMyProcedures(
      aggregates.executions,
      aggregates.steps,
      versions,
    );

    return {
      filters: { areaId: areaId ?? null, from: from ?? null, to: to ?? null },
      staleAfterHours: STALE_AFTER_HOURS,
      areaIds: viewerAreaIds,
      totals: myTotals(procedures, aggregates.executions, versions),
      resume: buildResume(aggregates.inProgress, versions, stale),
      procedures,
    };
  }
}
