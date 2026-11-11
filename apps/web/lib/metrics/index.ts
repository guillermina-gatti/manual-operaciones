// Single entry point of the assistant and documents metrics: both come from the API.
import { apiClient } from '@/lib/api';
import { createHttpTeamCMetrics } from './http-team-c-metrics';

export const teamCMetrics = createHttpTeamCMetrics(apiClient);

export type { AssistantMetrics, DocumentMetrics, TeamCMetricsSource } from './team-c-metrics';
