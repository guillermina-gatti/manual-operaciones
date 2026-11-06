/* Aggregates executions and their steps in PostgreSQL: counts and sums are computed
by the database, so no execution row is brought to Node */
import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ExecutionsRepositoryUnavailableError } from '../executions.repository';
import { isUnavailable } from '../prisma-executions.repository';
import {
  ExecutionMetricsRepository,
  InProgressExecution,
  MetricsAggregates,
  MetricsWindow,
  MyAggregates,
} from './execution-metrics.repository';
import type { ExecutionAggregate, StepAggregate } from './procedure-metrics';

// Milliseconds between two timestamps, as a number (epoch is in seconds).
const durationMs = (from: Prisma.Sql, to: Prisma.Sql) =>
  Prisma.sql`extract(epoch FROM ${to} - ${from}) * 1000`;

// The period applies to when the execution started. With userId, only that user's
// executions (personal metrics); without it, everyone's, as before.
function periodCondition(
  { from, to }: MetricsWindow,
  userId?: string,
): Prisma.Sql {
  const conditions = [
    userId ? Prisma.sql`e.user_id = ${userId}::uuid` : null,
    from ? Prisma.sql`e.started_at >= ${from}` : null,
    to ? Prisma.sql`e.started_at < ${to}` : null,
  ].filter((condition): condition is Prisma.Sql => condition !== null);
  return conditions.length === 0
    ? Prisma.sql`TRUE`
    : Prisma.join(conditions, ' AND ');
}

// Counts are cast to int and sums to float8, so they arrive as numbers and not as
// bigint or Decimal.
export function executionAggregatesSql(
  window: MetricsWindow,
  userId?: string,
): Prisma.Sql {
  const duration = durationMs(
    Prisma.sql`e.started_at`,
    Prisma.sql`e.finished_at`,
  );
  return Prisma.sql`
    SELECT e.procedure_id AS "procedureId",
           e.procedure_version_id AS "procedureVersionId",
           count(*)::int AS started,
           count(*) FILTER (WHERE e.status = 'COMPLETED')::int AS completed,
           count(*) FILTER (WHERE e.status = 'IN_PROGRESS')::int AS "inProgress",
           coalesce(sum(${duration}) FILTER (WHERE e.status = 'COMPLETED'), 0)::float8
             AS "completedDurationMs",
           max(e.started_at) AS "lastStartedAt"
    FROM executions e
    WHERE ${periodCondition(window, userId)}
    GROUP BY e.procedure_id, e.procedure_version_id
  `;
}

// A step row exists from the moment the step started. The only unfinished row of an
// execution in progress is its current step: abandoned if it started before staleBefore.
export function stepAggregatesSql(
  window: MetricsWindow,
  userId?: string,
): Prisma.Sql {
  const duration = durationMs(
    Prisma.sql`s.started_at`,
    Prisma.sql`s.finished_at`,
  );
  return Prisma.sql`
    SELECT e.procedure_version_id AS "procedureVersionId",
           s.step_id AS "stepId",
           count(*)::int AS reached,
           count(s.finished_at)::int AS finished,
           coalesce(sum(${duration}), 0)::float8 AS "finishedDurationMs",
           count(*) FILTER (
             WHERE s.finished_at IS NULL
               AND e.status = 'IN_PROGRESS'
               AND s.started_at < ${window.staleBefore}
           )::int AS abandoned
    FROM execution_steps s
    JOIN executions e ON e.id = s.execution_id
    WHERE ${periodCondition(window, userId)}
    GROUP BY e.procedure_version_id, s.step_id
  `;
}

// The user's executions in progress with their current step (the only unfinished row),
// the most recently moved first. No period: an old one can still be resumed.
export function inProgressSql(userId: string): Prisma.Sql {
  return Prisma.sql`
    SELECT e.id AS "executionId",
           e.procedure_id AS "procedureId",
           e.procedure_version_id AS "procedureVersionId",
           e.started_at AS "startedAt",
           s.step_id AS "currentStepId",
           s.step_order AS "currentStepOrder",
           s.started_at AS "currentStepStartedAt"
    FROM executions e
    JOIN execution_steps s ON s.execution_id = e.id AND s.finished_at IS NULL
    WHERE e.user_id = ${userId}::uuid
      AND e.status = 'IN_PROGRESS'
    ORDER BY s.started_at DESC, e.id
  `;
}

@Injectable()
export class PrismaExecutionMetricsRepository extends ExecutionMetricsRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  // Both queries read the same snapshot: an execution finishing in between cannot be
  // counted in progress by one and finished by the other.
  async aggregate(window: MetricsWindow): Promise<MetricsAggregates> {
    try {
      const [executions, steps] = await this.prisma.$transaction(
        [
          this.prisma.$queryRaw<ExecutionAggregate[]>(
            executionAggregatesSql(window),
          ),
          this.prisma.$queryRaw<StepAggregate[]>(stepAggregatesSql(window)),
        ],
        { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
      );
      return {
        executions: executions.map(toExecutionAggregate),
        steps: steps.map(toStepAggregate),
      };
    } catch (error) {
      throw unavailableOr(error);
    }
  }

  // The same snapshot for the three queries, like aggregate: an execution completed in
  // between cannot be counted in progress and also be missing from the resume list.
  async mine(userId: string, window: MetricsWindow): Promise<MyAggregates> {
    try {
      const [executions, steps, inProgress] = await this.prisma.$transaction(
        [
          this.prisma.$queryRaw<ExecutionAggregate[]>(
            executionAggregatesSql(window, userId),
          ),
          this.prisma.$queryRaw<StepAggregate[]>(
            stepAggregatesSql(window, userId),
          ),
          this.prisma.$queryRaw<InProgressExecution[]>(inProgressSql(userId)),
        ],
        { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
      );
      return {
        executions: executions.map(toExecutionAggregate),
        steps: steps.map(toStepAggregate),
        inProgress: inProgress.map(toInProgress),
      };
    } catch (error) {
      throw unavailableOr(error);
    }
  }
}

// A database that does not answer becomes the repository's error (503); anything else
// goes through unchanged.
function unavailableOr(error: unknown): unknown {
  return isUnavailable(error)
    ? new ExecutionsRepositoryUnavailableError('La base de datos no responde', {
        cause: error,
      })
    : error;
}

// Field by field, so only the expected columns leave the repository.
const toExecutionAggregate = (row: ExecutionAggregate): ExecutionAggregate => ({
  procedureId: row.procedureId,
  procedureVersionId: row.procedureVersionId,
  started: row.started,
  completed: row.completed,
  inProgress: row.inProgress,
  completedDurationMs: row.completedDurationMs,
  lastStartedAt: row.lastStartedAt,
});

const toStepAggregate = (row: StepAggregate): StepAggregate => ({
  procedureVersionId: row.procedureVersionId,
  stepId: row.stepId,
  reached: row.reached,
  finished: row.finished,
  finishedDurationMs: row.finishedDurationMs,
  abandoned: row.abandoned,
});

const toInProgress = (row: InProgressExecution): InProgressExecution => ({
  executionId: row.executionId,
  procedureId: row.procedureId,
  procedureVersionId: row.procedureVersionId,
  startedAt: row.startedAt,
  currentStepId: row.currentStepId,
  currentStepOrder: row.currentStepOrder,
  currentStepStartedAt: row.currentStepStartedAt,
});
