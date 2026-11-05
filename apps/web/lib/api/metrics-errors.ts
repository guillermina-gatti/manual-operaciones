// Turns API errors from /api/metrics into messages for the user (HU38).
// Like describeApiError, the texts sent by the API are never shown.
import { ApiError } from './api-error';
import { MESSAGES } from './error-messages';

export interface MetricsErrorDescription {
  message: string;
  // Whether it makes sense to offer "Reintentar".
  canRetry: boolean;
  // A supervisor asked for an area that is not theirs: the screen offers to see all of theirs.
  areaNotFound: boolean;
}

export const METRICS_MESSAGES = {
  noPermission: 'Solo los administradores y los supervisores pueden ver las métricas.',
  areaNotFound: 'No tenés acceso a las métricas de esa área.',
  checkFilters: 'Revisá las fechas y el área elegidas.',
} as const;

export function describeMetricsError(error: unknown): MetricsErrorDescription {
  if (!(error instanceof ApiError)) return describe(MESSAGES.unexpected, true);

  switch (error.status) {
    case 0:
      return describe(MESSAGES.noConnection, true);
    case 400:
      return describe(METRICS_MESSAGES.checkFilters, false);
    case 401:
      return describe(MESSAGES.sessionInvalid, false);
    case 403:
      return describe(METRICS_MESSAGES.noPermission, false);
    case 404:
      return { ...describe(METRICS_MESSAGES.areaNotFound, false), areaNotFound: true };
    case 503:
      return describe(MESSAGES.unavailable, true);
    default:
      return describe(MESSAGES.unexpected, true);
  }
}

function describe(message: string, canRetry: boolean): MetricsErrorDescription {
  return { message, canRetry, areaNotFound: false };
}
