/* How the assistant metrics read the questions of the chat, without depending on Prisma.
Read only: the chat tables belong to pair C. A database that does not answer throws
ExecutionsRepositoryUnavailableError, like the other metrics, which the API turns into a 503 */
import type { AssistantAggregate } from './assistant-metrics';
import type { MetricsScope } from './metrics-access.policy';

// Questions asked in [from, to); null means no limit on that side. The scope says whose
// questions count (the rules are in prisma-assistant-metrics.repository.ts).
export interface AssistantMetricsWindow {
  from: Date | null;
  to: Date | null;
  scope: MetricsScope;
}

export abstract class AssistantMetricsRepository {
  abstract totals(window: AssistantMetricsWindow): Promise<AssistantAggregate>;
}
