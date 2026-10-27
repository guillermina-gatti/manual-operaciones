// Empty adapter until pair C exposes their metrics: it never calls the API and always
// answers "not available", so the panel never shows made-up numbers.
import type { TeamCMetricsSource } from './team-c-metrics';

export function createUnavailableTeamCMetrics(): TeamCMetricsSource {
  return {
    getAssistant: () => Promise.resolve(null),
    getDocuments: () => Promise.resolve(null),
  };
}
