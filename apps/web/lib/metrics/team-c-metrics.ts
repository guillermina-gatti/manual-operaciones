// Port to the metrics of pair C (contract 5): GET /api/metrics/assistant and
// GET /api/metrics/documents. The panel shows them next to the procedures metrics.
// TODO(HU38): AssistantMetrics is still a proposal; agree it with pair C before its adapter.
import type { MetricsFilters } from '@/lib/api';

export interface AssistantMetrics {
  questions: number;
  unanswered: number;
  latencyP50Ms: number;
  latencyP95Ms: number;
  tokens: number;
  costUsd: number;
}

// GET /api/metrics/documents, copied from
// apps/api/src/documents/metrics/dto/document-metrics.response.ts; keep them in sync.
// Every total except uploaded is the current state: the dates only filter uploaded.
export interface DocumentMetrics {
  filters: { areaId: string | null; from: string | null; to: string | null };
  totals: {
    active: number; // = upToDate + dueSoon + overdue
    upToDate: number;
    dueSoon: number;
    overdue: number;
    processingFailed: number; // the current version failed processing
    uploaded: number; // uploaded between from and to
  };
}

// null: pair C does not provide these metrics yet. The panel says so, without numbers.
// Errors are ApiError, like any other call to the API.
export interface TeamCMetricsSource {
  getAssistant(filters: MetricsFilters, signal?: AbortSignal): Promise<AssistantMetrics | null>;
  getDocuments(filters: MetricsFilters, signal?: AbortSignal): Promise<DocumentMetrics | null>;
}
