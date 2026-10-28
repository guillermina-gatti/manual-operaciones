// Port to the metrics of pair C (contract 5): GET /api/metrics/assistant and
// GET /api/metrics/documents. The panel shows them next to the procedures metrics.
// TODO(HU38): the shapes below are a proposal; agree them with pair C before the real adapter.
import type { MetricsFilters } from '@/lib/api';

export interface AssistantMetrics {
  questions: number;
  unanswered: number;
  latencyP50Ms: number;
  latencyP95Ms: number;
  tokens: number;
  costUsd: number;
}

export interface DocumentMetrics {
  active: number;
  consulted: number;
  processingFailed: number;
}

// null: pair C does not provide these metrics yet. The panel says so, without numbers.
export interface TeamCMetricsSource {
  getAssistant(filters: MetricsFilters, signal?: AbortSignal): Promise<AssistantMetrics | null>;
  getDocuments(filters: MetricsFilters, signal?: AbortSignal): Promise<DocumentMetrics | null>;
}
