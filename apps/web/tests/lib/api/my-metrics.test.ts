import { describe, expect, test, vi } from 'vitest';
import { ApiError } from '@/lib/api';
import type { ApiClient } from '@/lib/api';
import { MESSAGES } from '@/lib/api/error-messages';
import {
  METRICS_MESSAGES,
  MY_METRICS_MESSAGES,
  describeMyMetricsError,
} from '@/lib/api/metrics-errors';
import { createMyMetricsApi } from '@/lib/api/my-metrics';
import { VENTAS, myMetricsResponse } from '../../support/my-metrics';

describe('getMyMetrics', () => {
  test('asks for /api/metrics/me with the filters and the abort signal, never a user', async () => {
    const answer = myMetricsResponse();
    const request = vi.fn().mockResolvedValue(answer);
    const client: ApiClient = { request };
    const signal = new AbortController().signal;

    const result = await createMyMetricsApi(client).getMyMetrics(
      { areaId: VENTAS, from: '2026-10-01', to: '2026-10-27' },
      signal,
    );

    expect(result).toBe(answer);
    expect(request).toHaveBeenCalledWith(
      `/api/metrics/me?areaId=${VENTAS}&from=2026-10-01&to=2026-10-27`,
      { signal },
    );
    expect(request.mock.calls[0][0]).not.toContain('user');
  });

  test('without filters asks for the plain path', async () => {
    const request = vi.fn().mockResolvedValue(myMetricsResponse());

    await createMyMetricsApi({ request }).getMyMetrics({});

    expect(request).toHaveBeenCalledWith('/api/metrics/me', { signal: undefined });
  });
});

describe('describeMyMetricsError', () => {
  test.each([
    [0, MESSAGES.noConnection, true],
    [400, METRICS_MESSAGES.checkFilters, false],
    [401, MESSAGES.sessionInvalid, false],
    [403, MY_METRICS_MESSAGES.noPermission, false],
    [503, MESSAGES.unavailable, true],
    [500, MESSAGES.unexpected, true],
  ])('%i → its message (retry: %s)', (status, message, canRetry) => {
    expect(describeMyMetricsError(new ApiError(status))).toEqual({
      message,
      canRetry,
      areaNotFound: false,
    });
  });

  test('404 is an area that is not theirs', () => {
    expect(describeMyMetricsError(new ApiError(404))).toEqual({
      message: 'No encontramos esa área entre las tuyas.',
      canRetry: false,
      areaNotFound: true,
    });
  });

  test('never shows the text sent by the API', () => {
    const { message } = describeMyMetricsError(new ApiError(404, ['No se encontró el área']));

    expect(message).not.toContain('No se encontró');
  });
});
