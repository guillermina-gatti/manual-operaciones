// What the execution screen shows above the steps, derived only from the API response.
import type { ExecutionResponse, ExecutionStepResponse } from '@/lib/api';

export interface ExecutionSummary {
  total: number;
  finishedCount: number;
  // The step in currentStepId; null once the execution is completed.
  currentStep: ExecutionStepResponse | null;
  // 1-based position of the current step ("Paso 3 de 4").
  currentNumber: number | null;
  // In progress with some step already finished: the employee is coming back to it.
  resumed: boolean;
  // From the start of the execution to its end; null while in progress.
  totalDurationMs: number | null;
}

export function summarizeExecution(execution: ExecutionResponse): ExecutionSummary {
  const { steps } = execution;
  const finishedCount = steps.filter((step) => step.finishedAt !== null).length;
  const index = steps.findIndex((step) => step.stepId === execution.currentStepId);
  const completed = execution.status === 'COMPLETED';

  return {
    total: steps.length,
    finishedCount,
    currentStep: index === -1 ? null : steps[index],
    currentNumber: index === -1 ? null : index + 1,
    resumed: !completed && finishedCount > 0,
    totalDurationMs:
      completed && execution.finishedAt
        ? Date.parse(execution.finishedAt) - Date.parse(execution.startedAt)
        : null,
  };
}
