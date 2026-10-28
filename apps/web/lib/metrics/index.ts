// Single entry point of the metrics of pair C. When they expose GET /api/metrics/assistant and
// GET /api/metrics/documents, only this line changes to the real adapter.
// TODO(HU38): replace the empty adapter once pair C delivers their endpoints.
import { createUnavailableTeamCMetrics } from './unavailable-team-c-metrics';

export const teamCMetrics = createUnavailableTeamCMetrics();

export type { AssistantMetrics, DocumentMetrics, TeamCMetricsSource } from './team-c-metrics';
