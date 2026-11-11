// HTTP adapter of the assistant and documents metrics, with the same filters as the procedures
// metrics: GET /api/metrics/assistant and GET /api/metrics/documents.
import { metricsQuery } from '@/lib/api';
import type { ApiClient } from '@/lib/api';
import type { AssistantMetrics, DocumentMetrics, TeamCMetricsSource } from './team-c-metrics';

export function createHttpTeamCMetrics(client: ApiClient): TeamCMetricsSource {
  return {
    getAssistant: (filters, signal) =>
      client.request<AssistantMetrics>(`/api/metrics/assistant${metricsQuery(filters)}`, {
        signal,
      }),
    getDocuments: (filters, signal) =>
      client.request<DocumentMetrics>(`/api/metrics/documents${metricsQuery(filters)}`, {
        signal,
      }),
  };
}
