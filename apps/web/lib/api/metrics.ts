// Calls to /api/metrics/procedures (HU38: procedures metrics panel, contract 5).
// TODO(HU38): these types are copied from
// apps/api/src/executions/metrics/dto/procedure-metrics.response.ts. Provisional until
// packages/shared exists; keep them in sync with the API until then.
import type { ApiClient } from './client';

export interface StepMetricsResponse {
  stepId: string;
  order: number;
  title: string;
  reached: number;
  finished: number;
  // null when nobody finished the step.
  avgDurationMs: number | null;
  abandoned: number;
  // abandoned / reached, from 0 to 1; null when nobody reached the step.
  abandonRate: number | null;
}

// started = completed + inProgress + abandoned.
export interface ExecutionCounts {
  started: number;
  completed: number;
  inProgress: number;
  abandoned: number;
}

export interface VersionMetricsResponse extends ExecutionCounts {
  procedureVersionId: string;
  steps: StepMetricsResponse[];
}

export interface ProcedureMetricsResponse extends ExecutionCounts {
  procedureId: string;
  areaIds: string[];
  completionRate: number | null;
  avgCompletionMs: number | null;
  // The version with the latest execution first.
  versions: VersionMetricsResponse[];
}

export interface ProceduresMetricsResponse {
  filters: { areaId: string | null; from: string | null; to: string | null };
  staleAfterHours: number;
  // The areas the user may filter by; null means any (ADMIN).
  areaIds: string[] | null;
  totals: ExecutionCounts & { completionRate: number | null };
  procedures: ProcedureMetricsResponse[];
}

// Days as "YYYY-MM-DD", both inclusive. A missing value is not sent.
export interface MetricsFilters {
  areaId?: string | null;
  from?: string | null;
  to?: string | null;
}

export function metricsQuery({ areaId, from, to }: MetricsFilters): string {
  const params = new URLSearchParams();
  if (areaId) params.set('areaId', areaId);
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const query = params.toString();
  return query ? `?${query}` : '';
}

export function createMetricsApi(client: ApiClient) {
  return {
    getProcedureMetrics(filters: MetricsFilters, signal?: AbortSignal) {
      return client.request<ProceduresMetricsResponse>(
        `/api/metrics/procedures${metricsQuery(filters)}`,
        { signal },
      );
    },
  };
}
