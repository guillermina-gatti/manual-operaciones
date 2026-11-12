import { Prisma } from '../../generated/prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { ExecutionsRepositoryUnavailableError } from '../executions.repository';
import type { MetricsWindow } from './execution-metrics.repository';
import {
  PrismaExecutionMetricsRepository,
  executionAggregatesSql,
  inProgressSql,
  stepAggregatesSql,
} from './prisma-execution-metrics.repository';

const PROCEDURE_ID = '1a000000-0000-4000-8000-000000000001';
const VERSION_ID = '1b000000-0000-4000-8000-000000000002';
const STEP_ID = '1c000000-0000-4000-8000-000000000004';
const FROM = new Date('2026-10-01T03:00:00.000Z');
const TO = new Date('2026-10-28T03:00:00.000Z');
const STALE = new Date('2026-10-26T15:00:00.000Z');
const LAST = new Date('2026-10-27T13:00:00.000Z');
const USER_ID = '0b000000-0000-4000-8000-000000000003';
const EXECUTION_ID = '1e000000-0000-4000-8000-000000000001';

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
      "WHERE e.status <> 'RESTARTED' AND e.started_at >= ? AND e.started_at < ? GROUP BY e.procedure_id, e.procedure_version_id",
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

  it('without limits filters only the restarted ones', () => {
    const sql = executionAggregatesSql({
      from: null,
      to: null,
      staleBefore: STALE,
    });

    expect(oneLine(sql)).toContain("WHERE e.status <> 'RESTARTED' GROUP BY");
    expect(sql.values).toEqual([]);
  });

  it('with only one limit uses only that one', () => {
    const sql = executionAggregatesSql({
      from: null,
      to: TO,
      staleBefore: STALE,
    });

    expect(oneLine(sql)).toContain(
      "WHERE e.status <> 'RESTARTED' AND e.started_at < ? GROUP BY",
    );
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

describe('personal metrics: only the executions of one user', () => {
  it('HU33: neither query counts a RESTARTED execution nor its steps', () => {
    expect(oneLine(executionAggregatesSql(WINDOW))).toContain(
      "WHERE e.status <> 'RESTARTED'",
    );
    expect(oneLine(stepAggregatesSql(WINDOW))).toContain(
      "WHERE e.status <> 'RESTARTED'",
    );
  });

  it('the aggregates of executions filter by user before the period', () => {
    const sql = executionAggregatesSql(WINDOW, USER_ID);

    expect(oneLine(sql)).toContain(
      "WHERE e.status <> 'RESTARTED' AND e.user_id = ?::uuid AND e.started_at >= ? AND e.started_at < ? GROUP BY",
    );
    expect(sql.values).toEqual([USER_ID, FROM, TO]);
  });

  it('the aggregates of steps filter by user too', () => {
    const sql = stepAggregatesSql(WINDOW, USER_ID);

    expect(oneLine(sql)).toContain(
      "WHERE e.status <> 'RESTARTED' AND e.user_id = ?::uuid AND e.started_at >= ? AND e.started_at < ? GROUP BY",
    );
    expect(sql.values).toEqual([STALE, USER_ID, FROM, TO]);
  });

  it('without a period, only the user', () => {
    const sql = executionAggregatesSql(
      { from: null, to: null, staleBefore: STALE },
      USER_ID,
    );

    expect(oneLine(sql)).toContain(
      "WHERE e.status <> 'RESTARTED' AND e.user_id = ?::uuid GROUP BY",
    );
    expect(sql.values).toEqual([USER_ID]);
  });

  it('without a user, the procedures metrics keep counting everyone', () => {
    expect(oneLine(executionAggregatesSql(WINDOW))).not.toContain('user_id');
    expect(oneLine(stepAggregatesSql(WINDOW))).not.toContain('user_id');
  });

  it('the executions to resume: the user, in progress, with the unfinished step, no period', () => {
    const sql = inProgressSql(USER_ID);
    const text = oneLine(sql);

    expect(text).toContain(
      'JOIN execution_steps s ON s.execution_id = e.id AND s.finished_at IS NULL',
    );
    expect(text).toContain(
      "WHERE e.user_id = ?::uuid AND e.status = 'IN_PROGRESS'",
    );
    expect(text).toContain('ORDER BY s.started_at DESC, e.id');
    expect(text).not.toContain('e.started_at >=');
    expect(sql.values).toEqual([USER_ID]);
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
          minCompletionMs: 480_000,
          maxCompletionMs: 600_000,
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
          minCompletionMs: 480_000,
          maxCompletionMs: 600_000,
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

  describe('mine', () => {
    const IN_PROGRESS = {
      executionId: EXECUTION_ID,
      procedureId: PROCEDURE_ID,
      procedureVersionId: VERSION_ID,
      startedAt: LAST,
      currentStepId: STEP_ID,
      currentStepOrder: 2,
      currentStepStartedAt: LAST,
    };

    it("runs the user's three queries in one repeatable read transaction", async () => {
      prisma.$transaction.mockResolvedValue([
        [],
        [],
        [{ ...IN_PROGRESS, userId: 'not mapped' }],
      ]);

      const mine = await repository.mine(USER_ID, WINDOW);

      const [queries, options] = prisma.$transaction.mock.calls[0] as [
        Prisma.Sql[],
        unknown,
      ];
      expect(queries.map(oneLine)).toEqual([
        oneLine(executionAggregatesSql(WINDOW, USER_ID)),
        oneLine(stepAggregatesSql(WINDOW, USER_ID)),
        oneLine(inProgressSql(USER_ID)),
      ]);
      expect(queries.every((query) => query.values.includes(USER_ID))).toBe(
        true,
      );
      expect(options).toEqual({ isolationLevel: 'RepeatableRead' });
      expect(mine).toEqual({
        executions: [],
        steps: [],
        inProgress: [IN_PROGRESS],
      });
    });

    it.each(['', '   '])(
      'without a user id (%p) fails without reading anyone else',
      async (userId) => {
        await expect(repository.mine(userId, WINDOW)).rejects.toThrow(
          'Personal metrics need the id of the user of the session',
        );
        expect(prisma.$transaction).not.toHaveBeenCalled();
      },
    );

    it('translates a database that is down', async () => {
      prisma.$transaction.mockRejectedValue(knownError('P1001'));

      await expect(repository.mine(USER_ID, WINDOW)).rejects.toBeInstanceOf(
        ExecutionsRepositoryUnavailableError,
      );
    });

    it('lets any other error through unchanged', async () => {
      const bug = new TypeError('x is undefined');
      prisma.$transaction.mockRejectedValue(bug);

      await expect(repository.mine(USER_ID, WINDOW)).rejects.toBe(bug);
    });
  });
});
