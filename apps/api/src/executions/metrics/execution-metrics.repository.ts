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

// An execution of the user still in progress, with its current step: the one row of
// execution_steps without finishedAt. Not limited by the period: every one can be resumed.
export interface InProgressExecution {
  executionId: string;
  procedureId: string;
  procedureVersionId: string;
  startedAt: Date;
  currentStepId: string;
  currentStepOrder: number;
  // When the current step started: the last time the execution moved.
  currentStepStartedAt: Date;
}

// The same aggregates as the procedures metrics, only of one user's executions, plus
// the ones that user can resume.
export interface MyAggregates extends MetricsAggregates {
  inProgress: InProgressExecution[];
}

export abstract class ExecutionMetricsRepository {
  abstract aggregate(window: MetricsWindow): Promise<MetricsAggregates>;

  // Only the executions of userId (personal metrics). userId always comes from the
  // session, never from the request.
  abstract mine(userId: string, window: MetricsWindow): Promise<MyAggregates>;
}
