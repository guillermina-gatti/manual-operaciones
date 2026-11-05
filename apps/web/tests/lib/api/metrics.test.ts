import { describe, expect, test, vi } from 'vitest';
import type { ApiClient } from '@/lib/api';
import { createMetricsApi, metricsQuery } from '@/lib/api/metrics';
import type { ProceduresMetricsResponse } from '@/lib/api/metrics';

const VENTAS = '0a000000-0000-4000-8000-000000000001';

// Same shape as the API's ProceduresMetricsResponse: if a web type drifts, this stops compiling.
const METRICS: ProceduresMetricsResponse = {
  filters: { areaId: VENTAS, from: '2026-10-01', to: '2026-10-27' },
  staleAfterHours: 24,
  areaIds: [VENTAS],
  totals: { started: 1, completed: 1, inProgress: 0, abandoned: 0, completionRate: 1 },
  procedures: [
    {
      procedureId: '1a000000-0000-4000-8000-000000000001',
      areaIds: [VENTAS],
      started: 1,
      completed: 1,
      inProgress: 0,
      abandoned: 0,
      completionRate: 1,
      avgCompletionMs: 720000,
      versions: [
        {
          procedureVersionId: '1b000000-0000-4000-8000-000000000002',
          started: 1,
          completed: 1,
          inProgress: 0,
          abandoned: 0,
          steps: [
            {
              stepId: '1c000000-0000-4000-8000-000000000004',
              order: 1,
              title: 'Contar el efectivo',
              reached: 1,
              finished: 1,
              avgDurationMs: 180000,
              abandoned: 0,
              abandonRate: 0,
            },
          ],
        },
      ],
    },
  ],
};

describe('metricsQuery', () => {
  test('sends only the filters that have a value', () => {
    expect(metricsQuery({})).toBe('');
    expect(metricsQuery({ areaId: null, from: '2026-10-01', to: null })).toBe('?from=2026-10-01');
  });

  test('sends every filter, encoded', () => {
    expect(metricsQuery({ areaId: VENTAS, from: '2026-10-01', to: '2026-10-27' })).toBe(
      `?areaId=${VENTAS}&from=2026-10-01&to=2026-10-27`,
    );
    expect(metricsQuery({ areaId: 'a&b=c' })).toBe('?areaId=a%26b%3Dc');
  });
});

describe('getProcedureMetrics', () => {
  test('gets the metrics with the filters and the abort signal', async () => {
    const request = vi.fn().mockResolvedValue(METRICS);
    const client: ApiClient = { request };
    const signal = new AbortController().signal;

    const result = await createMetricsApi(client).getProcedureMetrics(
      { areaId: VENTAS, from: '2026-10-01', to: '2026-10-27' },
      signal,
    );

    expect(result).toBe(METRICS);
    expect(request).toHaveBeenCalledWith(
      `/api/metrics/procedures?areaId=${VENTAS}&from=2026-10-01&to=2026-10-27`,
      { signal },
    );
  });

  test('without filters asks for the plain path', async () => {
    const request = vi.fn().mockResolvedValue(METRICS);

    await createMetricsApi({ request }).getProcedureMetrics({});

    expect(request).toHaveBeenCalledWith('/api/metrics/procedures', { signal: undefined });
  });
});
