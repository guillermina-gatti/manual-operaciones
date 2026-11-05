import { describe, expect, test, vi } from 'vitest';
import { ApiError } from '@/lib/api';
import type { ApiClient } from '@/lib/api';
import type { DocumentMetrics, TeamCMetricsSource } from '@/lib/metrics';
import { createHttpTeamCMetrics } from '@/lib/metrics/http-team-c-metrics';

const VENTAS = '0a000000-0000-4000-8000-000000000001';

// Same shape as the API's DocumentMetricsResponse: if a web type drifts, this stops compiling.
const DOCUMENTS: DocumentMetrics = {
  filters: { areaId: VENTAS, from: '2026-10-01', to: '2026-10-27' },
  totals: { active: 12, upToDate: 8, dueSoon: 3, overdue: 1, processingFailed: 0, uploaded: 4 },
};

const unavailable = (): TeamCMetricsSource => ({
  getAssistant: vi.fn().mockResolvedValue(null),
  getDocuments: vi.fn().mockResolvedValue(null),
});

describe('createHttpTeamCMetrics', () => {
  test('gets the documents metrics with the filters and the abort signal', async () => {
    const request = vi.fn().mockResolvedValue(DOCUMENTS);
    const client: ApiClient = { request };
    const signal = new AbortController().signal;

    const result = await createHttpTeamCMetrics(client, unavailable()).getDocuments(
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

    await createHttpTeamCMetrics({ request }, unavailable()).getDocuments({
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
      createHttpTeamCMetrics({ request }, unavailable()).getDocuments({ areaId: VENTAS }),
    ).rejects.toEqual(new ApiError(404));
  });

  test('the assistant still comes from the fallback, without calling the API', async () => {
    const request = vi.fn();
    const fallback = unavailable();
    const signal = new AbortController().signal;

    await expect(
      createHttpTeamCMetrics({ request }, fallback).getAssistant({ from: '2026-10-01' }, signal),
    ).resolves.toBeNull();

    expect(fallback.getAssistant).toHaveBeenCalledWith({ from: '2026-10-01' }, signal);
    expect(request).not.toHaveBeenCalled();
  });
});
