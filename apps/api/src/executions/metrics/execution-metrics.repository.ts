/* How the metrics service reads the aggregates of executions, without depending on
Prisma. A database that does not answer throws ExecutionsRepositoryUnavailableError,
the same as the executions repository, which the API turns into a 503 */
import type { ExecutionAggregate, StepAggregate } from './procedure-metrics';

// Executions started in [from, to); null means no limit on that side. A step still
// running that started before staleBefore counts as abandoned.
export interface MetricsWindow {
  from: Date | null;
  to: Date | null;
  staleBefore: Date;
}

export interface MetricsAggregates {
  executions: ExecutionAggregate[]; // one per procedure version
  steps: StepAggregate[]; // one per step of a version
}

export abstract class ExecutionMetricsRepository {
  abstract aggregate(window: MetricsWindow): Promise<MetricsAggregates>;
}
