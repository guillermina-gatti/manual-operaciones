/* How the execution service reads and writes executions, without depending on Prisma */
import type { ExecutionStatus } from '../generated/prisma/client';
import type { RecordedStep } from './execution-progress';

// The database did not answer (timeout, connection). The service turns it into a 503.
export class ExecutionsRepositoryUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'ExecutionsRepositoryUnavailableError';
  }
}

// The user already has an execution in progress for that procedure: the database
// rejected the insert (index executions_one_in_progress_idx).
export class ExecutionInProgressError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'ExecutionInProgressError';
  }
}

declare const transactionBrand: unique symbol;

// Opaque transaction: services only receive it and pass it back.
export type RepositoryTransaction = { readonly [transactionBrand]: true };

// A step row: it exists from the moment the step is started.
export interface ExecutionStepRecord extends RecordedStep {
  stepOrder: number;
}

export interface ExecutionRecord {
  id: string;
  userId: string;
  procedureId: string;
  procedureVersionId: string;
  status: ExecutionStatus;
  startedAt: Date;
  finishedAt: Date | null;
  steps: ExecutionStepRecord[]; // sorted by stepOrder
}

// A new execution, created IN_PROGRESS with its first step started at startedAt.
export interface NewExecution {
  id: string;
  userId: string;
  procedureId: string;
  procedureVersionId: string;
  startedAt: Date;
  firstStep: { stepId: string; stepOrder: number };
}

// Finish a step and start the next one at the same instant; with next = null the
// execution becomes COMPLETED with finishedAt.
export interface StepCompletion {
  executionId: string;
  stepId: string;
  finishedAt: Date;
  next: { stepId: string; stepOrder: number } | null;
}

export abstract class ExecutionsRepository {
  // All or nothing: if the callback fails, the transaction is rolled back.
  abstract runInTransaction<T>(
    fn: (tx: RepositoryTransaction) => Promise<T>,
  ): Promise<T>;

  // Inserts the execution and its first step atomically. Throws
  // ExecutionInProgressError if the user already has one in progress for it.
  abstract create(data: NewExecution): Promise<ExecutionRecord>;

  // The execution with its steps, or null. Inside a transaction the row stays
  // locked until it ends (SELECT … FOR UPDATE), so two completes cannot overlap.
  abstract findById(
    id: string,
    tx?: RepositoryTransaction,
  ): Promise<ExecutionRecord | null>;

  // The user's execution in progress for the procedure, or null.
  abstract findInProgress(
    userId: string,
    procedureId: string,
  ): Promise<ExecutionRecord | null>;

  // Applies a StepCompletion and returns the execution as it is afterwards.
  abstract completeStep(
    tx: RepositoryTransaction,
    data: StepCompletion,
  ): Promise<ExecutionRecord>;
}
