// Numbers of the general summary of the metrics panel (HU38) that the API does not give as such.
// They are computed from the procedures, never from the area cards: a procedure with two areas
// is shown in both, but it counts once here.
import type { ExecutionCounts, ProcedureMetricsResponse } from '@/lib/api';

// The average time of a completed execution, weighted by how many each procedure completed:
// Σ (average of the procedure × its completed) ÷ Σ completed. null without completed ones.
// TODO(HU38): use totals.avgCompletionMs once the API gives it; avgCompletionMs comes rounded
// to the millisecond, so this can differ from the exact average by less than a millisecond.
export function averageCompletionMs(
  procedures: Pick<ProcedureMetricsResponse, 'completed' | 'avgCompletionMs'>[],
): number | null {
  let completed = 0;
  let totalMs = 0;
  for (const procedure of procedures) {
    if (procedure.avgCompletionMs === null || procedure.completed === 0) continue;
    completed += procedure.completed;
    totalMs += procedure.avgCompletionMs * procedure.completed;
  }
  return completed === 0 ? null : Math.round(totalMs / completed);
}

// The share of each outcome over the executions, from 0 to 1. null when there are none.
export function outcomeShares({ started, completed, inProgress, abandoned }: ExecutionCounts): {
  completed: number | null;
  inProgress: number | null;
  abandoned: number | null;
} {
  const share = (part: number) => (started === 0 ? null : part / started);
  return {
    completed: share(completed),
    inProgress: share(inProgress),
    abandoned: share(abandoned),
  };
}
