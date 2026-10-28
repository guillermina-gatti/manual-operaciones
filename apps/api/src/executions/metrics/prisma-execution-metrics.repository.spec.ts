import { Prisma } from '../../generated/prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { ExecutionsRepositoryUnavailableError } from '../executions.repository';
import type { MetricsWindow } from './execution-metrics.repository';
import {
  PrismaExecutionMetricsRepository,
  executionAggregatesSql,
  stepAggregatesSql,
} from './prisma-execution-metrics.repository';

const PROCEDURE_ID = '1a000000-0000-4000-8000-000000000001';
const VERSION_ID = '1b000000-0000-4000-8000-000000000002';
const STEP_ID = '1c000000-0000-4000-8000-000000000004';
const FROM = new Date('2026-10-01T03:00:00.000Z');
const TO = new Date('2026-10-28T03:00:00.000Z');
const STALE = new Date('2026-10-26T15:00:00.000Z');
const LAST = new Date('2026-10-27T13:00:00.000Z');

const WINDOW: MetricsWindow = { from: FROM, to: TO, staleBefore: STALE };

const oneLine = (sql: Prisma.Sql) => sql.sql.replace(/\s+/g, ' ').trim();

const knownError = (code: string) =>
  new Prisma.PrismaClientKnownRequestError(`Prisma error ${code}`, {
    code,
    clientVersion: '7.10.0',
  });

describe('executionAggregatesSql', () => {
  it('groups by procedure version and filters by when the execution started', () => {
    const sql = executionAggregatesSql(WINDOW);

    expect(oneLine(sql)).toContain(
      'WHERE e.started_at >= ? AND e.started_at < ? GROUP BY e.procedure_id, e.procedure_version_id',
    );
    expect(sql.values).toEqual([FROM, TO]);
  });

  it('casts counts to int and sums to float8', () => {
    const text = oneLine(executionAggregatesSql(WINDOW));

    expect(text).toContain('count(*)::int AS started');
    expect(text).toContain(
      "count(*) FILTER (WHERE e.status = 'COMPLETED')::int AS completed",
    );
    expect(text).toContain(
      'count(*) FILTER (WHERE e.status = \'IN_PROGRESS\')::int AS "inProgress"',
    );
    expect(text).toContain(
      "coalesce(sum(extract(epoch FROM e.finished_at - e.started_at) * 1000) FILTER (WHERE e.status = 'COMPLETED'), 0)::float8",
    );
  });

  it('without limits filters nothing', () => {
    const sql = executionAggregatesSql({
      from: null,
      to: null,
      staleBefore: STALE,
    });

    expect(oneLine(sql)).toContain('WHERE TRUE GROUP BY');
    expect(sql.values).toEqual([]);
  });

  it('with only one limit uses only that one', () => {
    const sql = executionAggregatesSql({
      from: null,
      to: TO,
      staleBefore: STALE,
    });

    expect(oneLine(sql)).toContain('WHERE e.started_at < ? GROUP BY');
    expect(sql.values).toEqual([TO]);
  });
});

describe('stepAggregatesSql', () => {
  it('counts the abandoned steps: unfinished, of an execution in progress, started before staleBefore', () => {
    const sql = stepAggregatesSql(WINDOW);
    const text = oneLine(sql);

    expect(text).toContain(
      "count(*) FILTER ( WHERE s.finished_at IS NULL AND e.status = 'IN_PROGRESS' AND s.started_at < ? )::int AS abandoned",
    );
    expect(text).toContain('count(s.finished_at)::int AS finished');
    expect(text).toContain(
      'FROM execution_steps s JOIN executions e ON e.id = s.execution_id',
    );
    expect(text).toContain('GROUP BY e.procedure_version_id, s.step_id');
    expect(sql.values).toEqual([STALE, FROM, TO]);
  });
});

describe('PrismaExecutionMetricsRepository', () => {
  let prisma: { $queryRaw: jest.Mock; $transaction: jest.Mock };
  let repository: PrismaExecutionMetricsRepository;

  beforeEach(() => {
    prisma = {
      // Each query is returned as it is, so the test can see what went into the transaction.
      $queryRaw: jest.fn((sql: Prisma.Sql) => sql),
      $transaction: jest.fn(),
    };
    repository = new PrismaExecutionMetricsRepository(
      prisma as unknown as PrismaService,
    );
  });

  it('runs both queries in one repeatable read transaction and maps the rows field by field', async () => {
    prisma.$transaction.mockResolvedValue([
      [
        {
          procedureId: PROCEDURE_ID,
          procedureVersionId: VERSION_ID,
          started: 3,
          completed: 2,
          inProgress: 1,
          completedDurationMs: 1_080_000,
          lastStartedAt: LAST,
          extra: 'not mapped',
        },
      ],
      [
        {
          procedureVersionId: VERSION_ID,
          stepId: STEP_ID,
          reached: 3,
          finished: 2,
          finishedDurationMs: 360_000,
          abandoned: 1,
        },
      ],
    ]);

    const aggregates = await repository.aggregate(WINDOW);

    const [queries, options] = prisma.$transaction.mock.calls[0] as [
      Prisma.Sql[],
      unknown,
    ];
    expect(queries.map(oneLine)).toEqual([
      oneLine(executionAggregatesSql(WINDOW)),
      oneLine(stepAggregatesSql(WINDOW)),
    ]);
    expect(options).toEqual({ isolationLevel: 'RepeatableRead' });
    expect(aggregates).toEqual({
      executions: [
        {
          procedureId: PROCEDURE_ID,
          procedureVersionId: VERSION_ID,
          started: 3,
          completed: 2,
          inProgress: 1,
          completedDurationMs: 1_080_000,
          lastStartedAt: LAST,
        },
      ],
      steps: [
        {
          procedureVersionId: VERSION_ID,
          stepId: STEP_ID,
          reached: 3,
          finished: 2,
          finishedDurationMs: 360_000,
          abandoned: 1,
        },
      ],
    });
  });

  it('translates a database that is down', async () => {
    prisma.$transaction.mockRejectedValue(knownError('P1001'));

    await expect(repository.aggregate(WINDOW)).rejects.toBeInstanceOf(
      ExecutionsRepositoryUnavailableError,
    );
  });

  it('lets any other error through unchanged', async () => {
    const bug = new TypeError('x is undefined');
    prisma.$transaction.mockRejectedValue(bug);

    await expect(repository.aggregate(WINDOW)).rejects.toBe(bug);
  });
});
