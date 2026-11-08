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

export function createMyMetricsApi(client: ApiClient) {
  return {
    getMyMetrics(filters: MetricsFilters, signal?: AbortSignal) {
      return client.request<MyMetricsResponse>(`/api/metrics/me${metricsQuery(filters)}`, {
        signal,
      });
    },
  };
}
