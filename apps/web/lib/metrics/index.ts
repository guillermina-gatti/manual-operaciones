// Single entry point of the metrics of pair C. Documents already use GET /api/metrics/documents;
// when they expose GET /api/metrics/assistant, only the fallback below goes away.
// TODO(HU38): drop the empty fallback once pair C delivers the assistant endpoint.
import { apiClient } from '@/lib/api';
import { createHttpTeamCMetrics } from './http-team-c-metrics';
import { createUnavailableTeamCMetrics } from './unavailable-team-c-metrics';

export const teamCMetrics = createHttpTeamCMetrics(apiClient, createUnavailableTeamCMetrics());

export type { AssistantMetrics, DocumentMetrics, TeamCMetricsSource } from './team-c-metrics';
