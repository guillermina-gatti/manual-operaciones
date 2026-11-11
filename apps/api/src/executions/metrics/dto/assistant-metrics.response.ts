// Response classes of GET /metrics/assistant (Swagger) and the field-by-field mapping from
// the service view. Only counts, times and tokens: no question, answer or user.
import { ApiProperty } from '@nestjs/swagger';
import type { AssistantMetricsView } from '../assistant-metrics.service';

const LATENCY = { type: Number, nullable: true, minimum: 0 } as const;

export class AssistantFeedbackResponse {
  @ApiProperty({ description: 'Questions rated useful' })
  useful: number;

  @ApiProperty({ description: 'Questions rated not useful' })
  notUseful: number;
}

export class AssistantTotalsResponse {
  @ApiProperty({
    description:
      'answered + noInfo + conflict + aiUnavailable; without small talk',
  })
  questions: number;

  @ApiProperty({ description: 'Answered with the documents' })
  answered: number;

  @ApiProperty({ description: 'Not enough information in the documents' })
  noInfo: number;

  @ApiProperty({ description: 'Documents that contradict each other' })
  conflict: number;

  @ApiProperty({ description: 'The AI provider did not answer' })
  aiUnavailable: number;

  @ApiProperty({
    description:
      'Greetings and platform help, answered without the model. Left out of every other number',
  })
  smallTalk: number;

  @ApiProperty({
    ...LATENCY,
    example: 2400,
    description:
      'Median latency in milliseconds of the answered, no-info and conflict questions; null if there are none',
  })
  latencyP50Ms: number | null;

  @ApiProperty({
    ...LATENCY,
    example: 6100,
    description: '95th percentile, like latencyP50Ms',
  })
  latencyP95Ms: number | null;

  @ApiProperty({ description: 'Tokens sent to the model' })
  inputTokens: number;

  @ApiProperty({ description: 'Tokens the model answered with' })
  outputTokens: number;

  @ApiProperty({ type: AssistantFeedbackResponse })
  feedback: AssistantFeedbackResponse;
}

export class AssistantMetricsFiltersResponse {
  @ApiProperty({ format: 'uuid', type: String, nullable: true })
  areaId: string | null;

  @ApiProperty({ example: '2026-10-01', type: String, nullable: true })
  from: string | null;

  @ApiProperty({ example: '2026-10-27', type: String, nullable: true })
  to: string | null;
}

export class AssistantMetricsResponse {
  @ApiProperty({ type: AssistantMetricsFiltersResponse })
  filters: AssistantMetricsFiltersResponse;

  @ApiProperty({ type: AssistantTotalsResponse })
  totals: AssistantTotalsResponse;
}

export function toAssistantMetricsResponse(
  view: AssistantMetricsView,
): AssistantMetricsResponse {
  const { filters, totals } = view;
  return {
    filters: {
      areaId: filters.areaId,
      from: filters.from,
      to: filters.to,
    },
    totals: {
      questions: totals.questions,
      answered: totals.answered,
      noInfo: totals.noInfo,
      conflict: totals.conflict,
      aiUnavailable: totals.aiUnavailable,
      smallTalk: totals.smallTalk,
      latencyP50Ms: totals.latencyP50Ms,
      latencyP95Ms: totals.latencyP95Ms,
      inputTokens: totals.inputTokens,
      outputTokens: totals.outputTokens,
      feedback: {
        useful: totals.feedback.useful,
        notUseful: totals.feedback.notUseful,
      },
    },
  };
}
