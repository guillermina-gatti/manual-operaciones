import { describe, expect, test, vi } from 'vitest';
import { ApiError } from '@/lib/api';
import type { ApiClient } from '@/lib/api';
import type { AssistantMetrics, DocumentMetrics } from '@/lib/metrics';
import { createHttpTeamCMetrics } from '@/lib/metrics/http-team-c-metrics';

const VENTAS = '0a000000-0000-4000-8000-000000000001';

// Same shape as the API's DocumentMetricsResponse: if a web type drifts, this stops compiling.
const DOCUMENTS: DocumentMetrics = {
  filters: { areaId: VENTAS, from: '2026-10-01', to: '2026-10-27' },
  totals: { active: 12, upToDate: 8, dueSoon: 3, overdue: 1, processingFailed: 0, uploaded: 4 },
};

// Same shape as the API's AssistantMetricsResponse.
const ASSISTANT: AssistantMetrics = {
  filters: { areaId: VENTAS, from: '2026-10-01', to: '2026-10-27' },
  totals: {
    questions: 4,
    answered: 2,
    noInfo: 1,
    conflict: 0,
    aiUnavailable: 1,
    smallTalk: 3,
    latencyP50Ms: 2000,
    latencyP95Ms: null,
    inputTokens: 500,
    outputTokens: 60,
    feedback: { useful: 1, notUseful: 0 },
  },
};

describe('createHttpTeamCMetrics', () => {
  describe('documents', () => {
    test('gets the documents metrics with the filters and the abort signal', async () => {
      const request = vi.fn().mockResolvedValue(DOCUMENTS);
      const client: ApiClient = { request };
      const signal = new AbortController().signal;

      const result = await createHttpTeamCMetrics(client).getDocuments(
        { areaId: VENTAS, from: '2026-10-01', to: '2026-10-27' },
        signal,
      );

      expect(result).toBe(DOCUMENTS);
      expect(request).toHaveBeenCalledWith(
        `/api/metrics/documents?areaId=${VENTAS}&from=2026-10-01&to=2026-10-27`,
        { signal },
      );
    });

    test('sends only the filters that have a value', async () => {
      const request = vi.fn().mockResolvedValue(DOCUMENTS);

      await createHttpTeamCMetrics({ request }).getDocuments({
        areaId: null,
        from: '2026-10-01',
        to: null,
      });

      expect(request).toHaveBeenCalledWith('/api/metrics/documents?from=2026-10-01', {
        signal: undefined,
      });
    });

    test('passes the API errors through, for the card to describe', async () => {
      const request = vi.fn().mockRejectedValue(new ApiError(404));

      await expect(
        createHttpTeamCMetrics({ request }).getDocuments({ areaId: VENTAS }),
      ).rejects.toEqual(new ApiError(404));
    });
  });

  describe('assistant', () => {
    test('gets the assistant metrics with the filters and the abort signal', async () => {
      const request = vi.fn().mockResolvedValue(ASSISTANT);
      const signal = new AbortController().signal;

      const result = await createHttpTeamCMetrics({ request }).getAssistant(
        { areaId: VENTAS, from: '2026-10-01', to: '2026-10-27' },
        signal,
      );

      expect(result).toBe(ASSISTANT);
      expect(request).toHaveBeenCalledWith(
        `/api/metrics/assistant?areaId=${VENTAS}&from=2026-10-01&to=2026-10-27`,
        { signal },
      );
    });

    test('without filters, no query', async () => {
      const request = vi.fn().mockResolvedValue(ASSISTANT);

      await createHttpTeamCMetrics({ request }).getAssistant({});

      expect(request).toHaveBeenCalledWith('/api/metrics/assistant', { signal: undefined });
    });

    test('passes the API errors through, for the card to describe', async () => {
      const request = vi.fn().mockRejectedValue(new ApiError(503));

      await expect(createHttpTeamCMetrics({ request }).getAssistant({})).rejects.toEqual(
        new ApiError(503),
      );
    });
  });
});
