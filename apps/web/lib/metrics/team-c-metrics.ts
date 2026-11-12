// Port to the assistant and documents metrics (contract 5): GET /api/metrics/assistant and
// GET /api/metrics/documents. The panel shows them next to the procedures metrics.
import type { MetricsFilters } from '@/lib/api';

// GET /api/metrics/assistant, copied from
// apps/api/src/executions/metrics/dto/assistant-metrics.response.ts; keep them in sync.
// Small talk (greetings and platform help) only counts in smallTalk: it is left out of every
// other number. With an area, the questions of the people who belong to it today.
export interface AssistantMetrics {
  filters: { areaId: string | null; from: string | null; to: string | null };
  totals: {
    questions: number; // = answered + noInfo + conflict + aiUnavailable
    answered: number;
    noInfo: number;
    conflict: number;
    aiUnavailable: number;
    smallTalk: number;
    latencyP50Ms: number | null; // null without any timed question
    latencyP95Ms: number | null;
    inputTokens: number;
    outputTokens: number;
    feedback: { useful: number; notUseful: number };
  };
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

// Documents may still answer null: not available, and the panel says so, without numbers.
// Errors are ApiError, like any other call to the API.
export interface TeamCMetricsSource {
  getAssistant(filters: MetricsFilters, signal?: AbortSignal): Promise<AssistantMetrics>;
  getDocuments(filters: MetricsFilters, signal?: AbortSignal): Promise<DocumentMetrics | null>;
}
