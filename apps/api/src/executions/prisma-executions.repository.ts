/* Reads and writes executions in PostgreSQL with Prisma. A database that does not
answer becomes ExecutionsRepositoryUnavailableError, which the API turns into a 503 */
import { Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  ExecutionInProgressError,
  ExecutionRecord,
  ExecutionsRepository,
  ExecutionsRepositoryUnavailableError,
  NewExecution,
  RepositoryTransaction,
  StepCompletion,
} from './executions.repository';

// Same limits as the documents repository, so a frozen database never hangs a request.
const TRANSACTION_TIMEOUT_MS = 5000;
const TRANSACTION_MAX_WAIT_MS = 2000;

// Prisma codes that mean the database is not answering (same list as documents).
const UNAVAILABLE_CODES = new Set([
  'P1000', // the server rejected the credentials (e.g. another PostgreSQL on the port)
  'P1001', // server unreachable
  'P1002', // connection timeout
  'P1008', // operation timeout
  'P1017', // the server closed the connection
  'P2024', // timeout waiting for a free connection in the pool
  'P2028', // transaction error (its timeout expired)
]);

// Error of the pg driver when the server drops the connection; it has no code and
// @prisma/adapter-pg lets it through unconverted.
const PG_CONNECTION_LOST = 'Connection terminated unexpectedly';

// The partial unique index of the migration add_executions. Only a clash on it means
// "already in progress"; the unique keys of execution_steps are other problems.
const ONE_IN_PROGRESS_INDEX = 'executions_one_in_progress_idx';

const stepsInclude = {
  steps: { orderBy: { stepOrder: 'asc' } },
} satisfies Prisma.ExecutionInclude;

type ExecutionRow = Prisma.ExecutionGetPayload<{
  include: typeof stepsInclude;
}>;

@Injectable()
export class PrismaExecutionsRepository extends ExecutionsRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  runInTransaction<T>(
    fn: (tx: RepositoryTransaction) => Promise<T>,
  ): Promise<T> {
    return this.translate(() =>
      this.prisma.$transaction(
        (tx) => fn(tx as unknown as RepositoryTransaction),
        { timeout: TRANSACTION_TIMEOUT_MS, maxWait: TRANSACTION_MAX_WAIT_MS },
      ),
    );
  }

  // One statement: Prisma inserts the execution and its first step atomically.
  async create(data: NewExecution): Promise<ExecutionRecord> {
    try {
      const row = await this.translate(() =>
        this.prisma.execution.create({
          data: {
            id: data.id,
            userId: data.userId,
            procedureId: data.procedureId,
            procedureVersionId: data.procedureVersionId,
            status: 'IN_PROGRESS',
            startedAt: data.startedAt,
            steps: {
              create: {
                stepId: data.firstStep.stepId,
                stepOrder: data.firstStep.stepOrder,
                startedAt: data.startedAt,
              },
            },
          },
          include: stepsInclude,
        }),
      );
      return toRecord(row);
    } catch (error) {
      if (isUniqueViolationOn(error, ONE_IN_PROGRESS_INDEX)) {
        throw new ExecutionInProgressError(
          'The user already has an execution in progress for this procedure',
          { cause: error },
        );
      }
      throw error;
    }
  }

  // Inside a transaction, the row is locked first (SELECT … FOR UPDATE) and read
  // after, so two completes of the same execution run one after the other.
  findById(
    id: string,
    tx?: RepositoryTransaction,
  ): Promise<ExecutionRecord | null> {
    return this.translate(async () => {
      if (!tx) {
        const row = await this.prisma.execution.findUnique({
          where: { id },
          include: stepsInclude,
        });
        return row ? toRecord(row) : null;
      }
      const client = tx as unknown as Prisma.TransactionClient;
      const locked = await client.$queryRaw<{ id: string }[]>`
        SELECT id FROM executions WHERE id = ${id}::uuid FOR UPDATE
      `;
      if (locked.length === 0) return null;
      const row = await client.execution.findUnique({
        where: { id },
        include: stepsInclude,
      });
      return row ? toRecord(row) : null;
    });
  }

  findInProgress(
    userId: string,
    procedureId: string,
  ): Promise<ExecutionRecord | null> {
    return this.translate(async () => {
      const row = await this.prisma.execution.findFirst({
        where: { userId, procedureId, status: 'IN_PROGRESS' },
        include: stepsInclude,
      });
      return row ? toRecord(row) : null;
    });
  }

  // Ends the step; then starts the next one at the same instant, or closes the
  // execution. All inside the received transaction.
  completeStep(
    tx: RepositoryTransaction,
    data: StepCompletion,
  ): Promise<ExecutionRecord> {
    const client = tx as unknown as Prisma.TransactionClient;
    return this.translate(async () => {
      await client.executionStep.update({
        where: {
          executionId_stepId: {
            executionId: data.executionId,
            stepId: data.stepId,
          },
        },
        data: { finishedAt: data.finishedAt },
      });
      if (data.next) {
        await client.executionStep.create({
          data: {
            executionId: data.executionId,
            stepId: data.next.stepId,
            stepOrder: data.next.stepOrder,
            startedAt: data.finishedAt,
          },
        });
      } else {
        await client.execution.update({
          where: { id: data.executionId },
          data: { status: 'COMPLETED', finishedAt: data.finishedAt },
        });
      }
      const row = await client.execution.findUnique({
        where: { id: data.executionId },
        include: stepsInclude,
      });
      if (!row) throw new Error(`Execution ${data.executionId} disappeared`);
      return toRecord(row);
    });
  }

  private async translate<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (isUnavailable(error)) {
        throw new ExecutionsRepositoryUnavailableError(
          'La base de datos no responde',
          { cause: error },
        );
      }
      throw error;
    }
  }
}

// Also used by the metrics repository, so both report a database that is down alike.
export function isUnavailable(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientInitializationError) return true;
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    UNAVAILABLE_CODES.has(error.code)
  ) {
    return true;
  }
  return (
    error instanceof Error &&
    !('code' in error) &&
    error.message === PG_CONNECTION_LOST
  );
}

// With the pg adapter, a P2002 carries the name of the index that clashed in
// meta.driverAdapterError.cause.constraint.index (reported by PostgreSQL).
function isUniqueViolationOn(error: unknown, index: string): boolean {
  if (
    !(error instanceof Prisma.PrismaClientKnownRequestError) ||
    error.code !== 'P2002'
  ) {
    return false;
  }
  const meta = error.meta as
    | { driverAdapterError?: { cause?: { constraint?: { index?: string } } } }
    | undefined;
  return meta?.driverAdapterError?.cause?.constraint?.index === index;
}

// Field by field, so the row's internal ids never leave the repository.
function toRecord(row: ExecutionRow): ExecutionRecord {
  return {
    id: row.id,
    userId: row.userId,
    procedureId: row.procedureId,
    procedureVersionId: row.procedureVersionId,
    status: row.status,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    steps: row.steps.map((step) => ({
      stepId: step.stepId,
      stepOrder: step.stepOrder,
      startedAt: step.startedAt,
      finishedAt: step.finishedAt,
    })),
  };
}
