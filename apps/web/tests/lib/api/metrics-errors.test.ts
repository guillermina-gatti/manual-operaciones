import { describe, expect, test } from 'vitest';
import { ApiError } from '@/lib/api';
import { METRICS_MESSAGES, describeMetricsError } from '@/lib/api/metrics-errors';
import { MESSAGES } from '@/lib/api/error-messages';

describe('describeMetricsError', () => {
  test.each([
    [0, MESSAGES.noConnection, true],
    [400, METRICS_MESSAGES.checkFilters, false],
    [401, MESSAGES.sessionInvalid, false],
    [403, METRICS_MESSAGES.noPermission, false],
    [503, MESSAGES.unavailable, true],
    [500, MESSAGES.unexpected, true],
  ])('%i → its message (retry: %s)', (status, message, canRetry) => {
    expect(describeMetricsError(new ApiError(status))).toEqual({
      message,
      canRetry,
      areaNotFound: false,
    });
  });

  test('404 is an area of someone else', () => {
    expect(describeMetricsError(new ApiError(404))).toEqual({
      message: 'No tenés acceso a las métricas de esa área.',
      canRetry: false,
      areaNotFound: true,
    });
  });

  test('anything that is not an ApiError is unexpected and can be retried', () => {
    expect(describeMetricsError(new TypeError('x'))).toEqual({
      message: MESSAGES.unexpected,
      canRetry: true,
      areaNotFound: false,
    });
  });

  test('never shows the text sent by the API', () => {
    const error = new ApiError(404, ['Área 0a… no encontrada']);

    expect(describeMetricsError(error).message).not.toContain('0a…');
  });
});
