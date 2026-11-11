/* Use case of the assistant card of the metrics panel (HU38, contract 5): the questions to
the assistant, their results, latency, tokens and feedback, filtered by area and period */
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
import { activeAreaIdsOf } from '../viewer-areas';
import { AssistantTotals, toAssistantTotals } from './assistant-metrics';
import { AssistantMetricsRepository } from './assistant-metrics.repository';
import { metricsScope } from './metrics-access.policy';
import { DEFAULT_TIME_ZONE, toMetricsPeriod } from './metrics-period';

// Already validated by the DTO: from and to are "YYYY-MM-DD" days that exist.
export interface AssistantMetricsQuery {
  areaId?: string;
  from?: string;
  to?: string;
}

export interface AssistantMetricsView {
  filters: { areaId: string | null; from: string | null; to: string | null };
  totals: AssistantTotals;
}

// The same answer for an area that is not the supervisor's and one that does not
// exist for them, as in the procedures metrics.
const areaNotFound = () => new NotFoundException('No se encontró el área');

@Injectable()
export class AssistantMetricsService {
  private readonly logger = new Logger(AssistantMetricsService.name);
  private readonly timeZone = process.env.APP_TIMEZONE || DEFAULT_TIME_ZONE;

  constructor(
    private readonly users: UsersDirectory,
    private readonly areas: AreasDirectory,
    private readonly metrics: AssistantMetricsRepository,
  ) {}

  async assistant(
    user: AuthUser,
    query: AssistantMetricsQuery,
  ): Promise<AssistantMetricsView> {
    try {
      return await this.build(user, query);
    } catch (error) {
      throw toHttpException(error, this.logger, 'metrics');
    }
  }

  private async build(
    user: AuthUser,
    { areaId, from, to }: AssistantMetricsQuery,
  ): Promise<AssistantMetricsView> {
    // "YYYY-MM-DD" sorts like the dates it represents.
    if (from && to && from > to) {
      throw new BadRequestException(
        'La fecha de inicio no puede ser posterior a la fecha de fin',
      );
    }

    // Who may see what, as in the procedures metrics: only the active areas of the
    // viewer, read on every request. Which questions belong to an area is decided by
    // the repository (prisma-assistant-metrics.repository.ts).
    const viewerAreaIds = await activeAreaIdsOf(
      this.users,
      this.areas,
      user.id,
    );
    const scope = metricsScope(user.role, viewerAreaIds, areaId);
    if (!scope) throw areaNotFound();

    const aggregate = await this.metrics.totals({
      ...toMetricsPeriod(from, to, this.timeZone),
      scope,
    });
    return {
      filters: { areaId: areaId ?? null, from: from ?? null, to: to ?? null },
      totals: toAssistantTotals(aggregate),
    };
  }
}
