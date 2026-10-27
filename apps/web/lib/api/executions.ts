// Calls to /api/executions (spec 005, HU12: step-by-step execution).
// TODO(HU12): these types are copied from apps/api/src/executions/dto/execution.response.ts.
// Provisional until packages/shared exists; keep them in sync with the API until then.
import type { ApiClient } from './client';

export type ExecutionStatus = 'IN_PROGRESS' | 'COMPLETED';

// Steps that have not started yet come with every date and the duration in null.
export interface ExecutionStepResponse {
  stepId: string;
  order: number;
  title: string;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
}

export interface ExecutionResponse {
  id: string;
  procedureId: string;
  procedureVersionId: string;
  status: ExecutionStatus;
  startedAt: string;
  finishedAt: string | null;
  // null once the execution is COMPLETED.
  currentStepId: string | null;
  steps: ExecutionStepResponse[];
}

const executionPath = (id: string) => `/api/executions/${encodeURIComponent(id)}`;

export function createExecutionsApi(client: ApiClient) {
  return {
    // Starts the procedure, or returns the execution already in progress (201 or 200: the
    // client only gives the body, and the screen treats both the same).
    startExecution(procedureId: string, signal?: AbortSignal) {
      return client.request<ExecutionResponse>('/api/executions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ procedureId }),
        signal,
      });
    },

    getExecution(id: string, signal?: AbortSignal) {
      return client.request<ExecutionResponse>(executionPath(id), { signal });
    },

    // Only the current step can be completed; the API answers 409 otherwise.
    completeStep(id: string, stepId: string, signal?: AbortSignal) {
      return client.request<ExecutionResponse>(
        `${executionPath(id)}/steps/${encodeURIComponent(stepId)}/complete`,
        { method: 'POST', signal },
      );
    },
  };
}
