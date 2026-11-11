import { Prisma } from '../../generated/prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { ExecutionsRepositoryUnavailableError } from '../executions.repository';
import type { AssistantAggregate } from './assistant-metrics';
import type { AssistantMetricsWindow } from './assistant-metrics.repository';
import {
  PrismaAssistantMetricsRepository,
  SMALL_TALK,
  assistantTotalsSql,
  scopeCondition,
} from './prisma-assistant-metrics.repository';

const VENTAS = '0a000000-0000-4000-8000-000000000001';
const OPERACIONES = '0a000000-0000-4000-8000-000000000002';
const FROM = new Date('2026-10-01T03:00:00.000Z');
const TO = new Date('2026-10-28T03:00:00.000Z');

const ALL: AssistantMetricsWindow = {
  from: null,
  to: null,
  scope: { all: true },
};

const oneLine = (sql: Prisma.Sql) => sql.sql.replace(/\s+/g, ' ').trim();

const knownError = (code: string) =>
  new Prisma.PrismaClientKnownRequestError(`Prisma error ${code}`, {
    code,
    clientVersion: '7.10.0',
  });

const ROW: AssistantAggregate = {
  answered: 1,
  noInfo: 0,
  conflict: 0,
  aiUnavailable: 0,
  smallTalk: 0,
  latencyP50Ms: 1000,
  latencyP95Ms: 1000,
  inputTokens: 10,
  outputTokens: 5,
  useful: 0,
  notUseful: 0,
};

describe('SMALL_TALK', () => {
  it('is an answer without model and without chunks, never by its tokens', () => {
    expect(oneLine(SMALL_TALK)).toBe(
      "(m.status = 'ANSWERED' AND m.model_name IS NULL AND cardinality(m.used_chunk_ids) = 0)",
    );
    expect(SMALL_TALK.sql).not.toContain('tokens');
  });
});

describe('scopeCondition', () => {
  it('everything: no condition', () => {
    expect(scopeCondition({ all: true })).toBeNull();
  });

  it('no areas: nothing counts', () => {
    expect(oneLine(scopeCondition({ all: false, areaIds: [] })!)).toBe('false');
  });

  it('areas: people who currently belong to one of them, active, and never an ADMIN', () => {
    const sql = scopeCondition({ all: false, areaIds: [VENTAS, OPERACIONES] })!;
    const text = oneLine(sql);

    expect(text).toContain('EXISTS ( SELECT 1 FROM users u');
    expect(text).toContain('WHERE u.id = c.user_id');
    expect(text).toContain('AND u.is_active');
    expect(text).toContain("AND u.role <> 'ADMIN'");
    expect(text).toContain('AND a.is_active');
    expect(text).toContain('AND ua.area_id IN (?::uuid,?::uuid)');
    expect(sql.values).toEqual([VENTAS, OPERACIONES]);
  });
});

describe('assistantTotalsSql', () => {
  it('without limits reads every question, once', () => {
    const sql = assistantTotalsSql(ALL);
    const text = oneLine(sql);

    expect(text).toContain(
      'FROM messages m JOIN conversations c ON c.id = m.conversation_id LEFT JOIN message_feedback f ON f.message_id = m.id )',
    );
    expect(text).not.toContain('WHERE m.');
    expect(text).not.toContain('GROUP BY');
    expect(sql.values).toEqual([]);
  });

  it('the period applies to when the question was asked', () => {
    const sql = assistantTotalsSql({ ...ALL, from: FROM, to: TO });

    expect(oneLine(sql)).toContain(
      'WHERE m.created_at >= ? AND m.created_at < ?',
    );
    expect(sql.values).toEqual([FROM, TO]);
  });

  it('the period and the areas go together', () => {
    const sql = assistantTotalsSql({
      from: FROM,
      to: null,
      scope: { all: false, areaIds: [VENTAS] },
    });

    expect(oneLine(sql)).toContain('WHERE m.created_at >= ? AND EXISTS (');
    expect(sql.values).toEqual([FROM, VENTAS]);
  });

  it('small talk only counts as itself', () => {
    const text = oneLine(assistantTotalsSql(ALL));

    expect(text).toContain(
      "count(*) FILTER (WHERE q.status = 'ANSWERED' AND NOT q.small_talk)::int AS answered",
    );
    expect(text).toContain(
      'count(*) FILTER (WHERE q.small_talk)::int AS "smallTalk"',
    );
    expect(text).toContain(
      'coalesce(sum(q.input_tokens) FILTER (WHERE NOT q.small_talk), 0)::float8 AS "inputTokens"',
    );
    expect(text).toContain(
      'coalesce(sum(q.output_tokens) FILTER (WHERE NOT q.small_talk), 0)::float8 AS "outputTokens"',
    );
    expect(text).toContain(
      'count(*) FILTER (WHERE q.useful AND NOT q.small_talk)::int AS useful',
    );
    expect(text).toContain(
      'count(*) FILTER (WHERE q.useful = false AND NOT q.small_talk)::int AS "notUseful"',
    );
  });

  it('the latency only of answered, no-info and conflict questions', () => {
    const text = oneLine(assistantTotalsSql(ALL));
    const timed =
      "FILTER (WHERE q.status IN ('ANSWERED', 'NO_INFO', 'CONFLICT') AND NOT q.small_talk)";

    expect(text).toContain(
      `(percentile_cont(0.5) WITHIN GROUP (ORDER BY q.latency_ms) ${timed})::float8 AS "latencyP50Ms"`,
    );
    expect(text).toContain(
      `(percentile_cont(0.95) WITHIN GROUP (ORDER BY q.latency_ms) ${timed})::float8 AS "latencyP95Ms"`,
    );
  });
});

describe('PrismaAssistantMetricsRepository', () => {
  const repositoryWith = (queryRaw: jest.Mock) =>
    new PrismaAssistantMetricsRepository({
      $queryRaw: queryRaw,
    } as unknown as PrismaService);

  it('returns only the expected columns of the one row', async () => {
    const queryRaw = jest.fn().mockResolvedValue([{ ...ROW, extra: 'x' }]);

    await expect(repositoryWith(queryRaw).totals(ALL)).resolves.toEqual(ROW);
    expect(queryRaw).toHaveBeenCalledTimes(1);
  });

  it('a database that does not answer is ExecutionsRepositoryUnavailableError', async () => {
    const cause = knownError('P1001');
    const queryRaw = jest.fn().mockRejectedValue(cause);

    const error: unknown = await repositoryWith(queryRaw)
      .totals(ALL)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ExecutionsRepositoryUnavailableError);
    expect((error as Error).cause).toBe(cause);
  });

  it('any other error goes through unchanged', async () => {
    const cause = knownError('P2010');
    const queryRaw = jest.fn().mockRejectedValue(cause);

    await expect(repositoryWith(queryRaw).totals(ALL)).rejects.toBe(cause);
  });
});
