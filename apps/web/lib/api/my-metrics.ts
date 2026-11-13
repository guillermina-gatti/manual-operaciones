// Calls to /api/metrics/me: the employee's own activity (only EMPLOYEE; the user always comes from
// the session, so no user id is ever sent). The filters are the same as /api/metrics/procedures.
// TODO(HU38): these types are copied from apps/api/src/executions/metrics/dto/my-metrics.response.ts.
// Provisional until packages/shared exists; keep them in sync with the API until then.
import type { ApiClient } from './client';
import { metricsQuery } from './metrics';
import type { ExecutionCounts, MetricsFilters } from './metrics';

export interface MyMetricsTotals extends ExecutionCounts {
  // null when none was completed in the period.
  avgCompletionMs: number | null;
}

// An execution of the employee still in progress, with no period: they can always resume it.
export interface MyResumeItem {
  executionId: string;
  procedureId: string;
  // The title of the version it runs; null when the catalog does not give it.
  procedureTitle?: string | null;
  procedureVersionId: string;
  currentStep: { stepId: string; order: number; title: string };
  totalSteps: number;
  startedAt: string;
  // When the current step started: the last time the execution moved.
  lastActivityAt: string;
  // The current step has been open for more than staleAfterHours.
  stale: boolean;
}

export interface MyProcedureMetrics extends ExecutionCounts {
  procedureId: string;
  title?: string | null; // as in the procedures metrics
  areaIds: string[];
  avgCompletionMs: number | null;
  lastStartedAt: string;
  // In the latest version they ran; null when they finished no step of it.
  slowestStep: { stepId: string; order: number; title: string; avgDurationMs: number } | null;
}

export interface MyMetricsResponse {
  filters: { areaId: string | null; from: string | null; to: string | null };
  staleAfterHours: number;
  // The active areas of the employee: the ones they may filter by.
  areaIds: string[];
  totals: MyMetricsTotals;
  // The most recently moved first.
  resume: MyResumeItem[];
  // The most recently started first.
  procedures: MyProcedureMetrics[];
}

// GET /api/metrics/me/daily (apps/api/src/executions/metrics/dto/my-daily-metrics.response.ts).
// The server decides the window: the last 21 days up to today and the current week, in the
// company time zone. Only the area can be sent.
export interface MyDailyProcedure {
  procedureId: string;
  title: string | null;
  // Executions completed that day.
  completed: number;
}

export interface MyDailyDay {
  date: string; // "YYYY-MM-DD"
  // Empty on a day without completed executions.
  procedures: MyDailyProcedure[];
}

export interface MyDailyWeek {
  from: string; // Monday
  to: string; // Friday
  // Monday to Friday days with a step finished or an execution completed, every area.
  activeDays: string[];
  // Executions completed from Monday to Sunday, every area.
  completedCount: number;
}

export interface MyDailyActivityResponse {
  windowFrom: string;
  windowTo: string; // today
  // The 21 days, ascending, also the empty ones.
  days: MyDailyDay[];
  // The current week; on Saturday and Sunday, the one that just ended.
  week: MyDailyWeek;
}

export function createMyMetricsApi(client: ApiClient) {
  return {
    getMyMetrics(filters: MetricsFilters, signal?: AbortSignal) {
      return client.request<MyMetricsResponse>(`/api/metrics/me${metricsQuery(filters)}`, {
        signal,
      });
    },

    // Without an area, every area of the employee. The week never depends on it.
    getMyDailyActivity(areaId: string | null | undefined, signal?: AbortSignal) {
      const query = areaId ? `?areaId=${encodeURIComponent(areaId)}` : '';
      return client.request<MyDailyActivityResponse>(`/api/metrics/me/daily${query}`, {
        signal,
      });
    },
  };
}
