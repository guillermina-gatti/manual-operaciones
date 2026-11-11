/* Adds up the questions of the chat in PostgreSQL (tables messages, conversations and
message_feedback of pair C, only read here): no question row is brought to Node */
import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ExecutionsRepositoryUnavailableError } from '../executions.repository';
import { isUnavailable } from '../prisma-executions.repository';
import type { AssistantAggregate } from './assistant-metrics';
import {
  AssistantMetricsRepository,
  AssistantMetricsWindow,
} from './assistant-metrics.repository';

// Small talk: greetings and platform help. chat-pipeline.ts (prepareChat) answers them with
// a fixed text, without calling the model, and saves them as ANSWERED with no model and
// no chunks. Every answer of the model has a model name (LlmAnswer.modelName is required
// and never empty) and at least one chunk (citedChunks falls back to all the retrieved
// ones). Tokens are not used: the provider may not report them for a real answer.
export const SMALL_TALK = Prisma.sql`(m.status = 'ANSWERED' AND m.model_name IS NULL AND cardinality(m.used_chunk_ids) = 0)`;

// Whose questions count. AN APPROXIMATION until the chat saves the area of each question:
// the chat does not record it, so the area is the one the person who asked belongs to
// TODAY (conversations.user_id → user_areas).
// - Only active areas, and only of an active user, like activeAreaIdsOf (viewer-areas.ts).
// - With an area (areaId, or the areas of a SUPERVISOR), the questions of the people who
//   currently belong to one of those areas. EXISTS, so a person in several areas counts
//   each question once, never once per area.
// - The questions of an ADMIN only count without an area filter, so only for an ADMIN:
//   never with areaId nor for a SUPERVISOR, even if the ADMIN has areas.
// - Without a filter (ADMIN), every question once, whoever asked it.
// So the questions of a person who changes area move with them, and those of a person who
// left every area only appear for an ADMIN without a filter.
export function scopeCondition(
  scope: AssistantMetricsWindow['scope'],
): Prisma.Sql | null {
  if (scope.all) return null;
  if (scope.areaIds.length === 0) return Prisma.sql`false`;
  return Prisma.sql`EXISTS (
      SELECT 1
      FROM users u
      JOIN user_areas ua ON ua.user_id = u.id
      JOIN areas a ON a.id = ua.area_id
      WHERE u.id = c.user_id
        AND u.is_active
        AND u.role <> 'ADMIN'
        AND a.is_active
        AND ua.area_id IN (${Prisma.join(scope.areaIds.map((id) => Prisma.sql`${id}::uuid`))})
    )`;
}

// The period applies to when the question was asked; the feedback follows its question.
function windowCondition({ from, to, scope }: AssistantMetricsWindow) {
  const conditions = [
    from ? Prisma.sql`m.created_at >= ${from}` : null,
    to ? Prisma.sql`m.created_at < ${to}` : null,
    scopeCondition(scope),
  ].filter((condition): condition is Prisma.Sql => condition !== null);
  return conditions.length > 0
    ? Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}`
    : Prisma.empty;
}

// Small talk is left out of everything but its own count. The latency is only of the
// questions the documents answered or tried to (ANSWERED, NO_INFO, CONFLICT): an
// AI_UNAVAILABLE one measures how long the failure took. Counts are cast to int and sums
// and percentiles to float8, so they arrive as numbers and not as bigint or Decimal.
export function assistantTotalsSql(window: AssistantMetricsWindow): Prisma.Sql {
  const timed = Prisma.sql`q.status IN ('ANSWERED', 'NO_INFO', 'CONFLICT') AND NOT q.small_talk`;
  return Prisma.sql`
    WITH q AS (
      SELECT m.status, m.latency_ms, m.input_tokens, m.output_tokens, f.useful,
             ${SMALL_TALK} AS small_talk
      FROM messages m
      JOIN conversations c ON c.id = m.conversation_id
      LEFT JOIN message_feedback f ON f.message_id = m.id
      ${windowCondition(window)}
    )
    SELECT count(*) FILTER (WHERE q.status = 'ANSWERED' AND NOT q.small_talk)::int AS answered,
           count(*) FILTER (WHERE q.status = 'NO_INFO')::int AS "noInfo",
           count(*) FILTER (WHERE q.status = 'CONFLICT')::int AS conflict,
           count(*) FILTER (WHERE q.status = 'AI_UNAVAILABLE')::int AS "aiUnavailable",
           count(*) FILTER (WHERE q.small_talk)::int AS "smallTalk",
           (percentile_cont(0.5) WITHIN GROUP (ORDER BY q.latency_ms) FILTER (WHERE ${timed}))::float8
             AS "latencyP50Ms",
           (percentile_cont(0.95) WITHIN GROUP (ORDER BY q.latency_ms) FILTER (WHERE ${timed}))::float8
             AS "latencyP95Ms",
           coalesce(sum(q.input_tokens) FILTER (WHERE NOT q.small_talk), 0)::float8 AS "inputTokens",
           coalesce(sum(q.output_tokens) FILTER (WHERE NOT q.small_talk), 0)::float8 AS "outputTokens",
           count(*) FILTER (WHERE q.useful AND NOT q.small_talk)::int AS useful,
           count(*) FILTER (WHERE q.useful = false AND NOT q.small_talk)::int AS "notUseful"
    FROM q
  `;
}

@Injectable()
export class PrismaAssistantMetricsRepository extends AssistantMetricsRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async totals(window: AssistantMetricsWindow): Promise<AssistantAggregate> {
    try {
      const [row] = await this.prisma.$queryRaw<AssistantAggregate[]>(
        assistantTotalsSql(window),
      );
      return toAggregate(row);
    } catch (error) {
      throw isUnavailable(error)
        ? new ExecutionsRepositoryUnavailableError(
            'La base de datos no responde',
            { cause: error },
          )
        : error;
    }
  }
}

// Field by field, so only the expected columns leave the repository.
const toAggregate = (row: AssistantAggregate): AssistantAggregate => ({
  answered: row.answered,
  noInfo: row.noInfo,
  conflict: row.conflict,
  aiUnavailable: row.aiUnavailable,
  smallTalk: row.smallTalk,
  latencyP50Ms: row.latencyP50Ms,
  latencyP95Ms: row.latencyP95Ms,
  inputTokens: row.inputTokens,
  outputTokens: row.outputTokens,
  useful: row.useful,
  notUseful: row.notUseful,
});
