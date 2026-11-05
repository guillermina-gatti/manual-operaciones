// HTTP adapter of the metrics of pair C. Documents come from GET /api/metrics/documents, with the
// same filters as the procedures metrics. The assistant still comes from the fallback until pair C
// exposes GET /api/metrics/assistant.
import { metricsQuery } from '@/lib/api';
import type { ApiClient } from '@/lib/api';
import type { DocumentMetrics, TeamCMetricsSource } from './team-c-metrics';

export function createHttpTeamCMetrics(
  client: ApiClient,
  fallback: TeamCMetricsSource,
): TeamCMetricsSource {
  return {
    getAssistant: (filters, signal) => fallback.getAssistant(filters, signal),
    getDocuments: (filters, signal) =>
      client.request<DocumentMetrics>(`/api/metrics/documents${metricsQuery(filters)}`, {
        signal,
      }),
  };
}
