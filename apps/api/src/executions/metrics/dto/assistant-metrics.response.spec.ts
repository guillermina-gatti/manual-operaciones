import type { AssistantMetricsView } from '../assistant-metrics.service';
import { toAssistantMetricsResponse } from './assistant-metrics.response';

const VIEW: AssistantMetricsView = {
  filters: {
    areaId: '0a000000-0000-4000-8000-000000000001',
    from: '2026-10-01',
    to: null,
  },
  totals: {
    questions: 4,
    answered: 2,
    noInfo: 1,
    conflict: 1,
    aiUnavailable: 0,
    smallTalk: 1,
    latencyP50Ms: 2000,
    latencyP95Ms: null,
    inputTokens: 700,
    outputTokens: 90,
    feedback: { useful: 1, notUseful: 1 },
  },
};

describe('toAssistantMetricsResponse', () => {
  it('maps every field of the contract', () => {
    expect(toAssistantMetricsResponse(VIEW)).toEqual(VIEW);
  });

  it('only the fields of the contract leave', () => {
    const response = toAssistantMetricsResponse({
      ...VIEW,
      totals: { ...VIEW.totals, extra: 1 } as AssistantMetricsView['totals'],
      filters: {
        ...VIEW.filters,
        userId: 'x',
      } as AssistantMetricsView['filters'],
    });

    expect(Object.keys(response.totals)).toEqual([
      'questions',
      'answered',
      'noInfo',
      'conflict',
      'aiUnavailable',
      'smallTalk',
      'latencyP50Ms',
      'latencyP95Ms',
      'inputTokens',
      'outputTokens',
      'feedback',
    ]);
    expect(Object.keys(response.filters)).toEqual(['areaId', 'from', 'to']);
  });
});
