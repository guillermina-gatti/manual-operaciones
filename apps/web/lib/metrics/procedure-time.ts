// Rows of "Tiempo por procedimiento" (HU38): how long a complete execution takes, from start to
// end, per procedure, slowest first. Pure: the names and areas are resolved by the caller.
import type { ProcedureMetricsResponse, StepMetricsResponse } from '@/lib/api';

export interface SlowestStep {
  title: string;
  avgDurationMs: number;
}

export interface ProcedureTimeRow {
  procedureId: string;
  areaIds: string[];
  completed: number;
  avgCompletionMs: number | null;
  // The fastest and the slowest completed execution; null without any.
  minCompletionMs: number | null;
  maxCompletionMs: number | null;
  // Bar length: this average over the slowest one of the list, from 0 to 1.
  barRatio: number;
  slowestStep: SlowestStep | null;
}

// The step with the highest average time; on a tie, the first one. null if no step has a time.
export function slowestStep(steps: StepMetricsResponse[]): SlowestStep | null {
  let slowest: SlowestStep | null = null;
  for (const step of steps) {
    if (step.avgDurationMs === null) continue;
    if (!slowest || step.avgDurationMs > slowest.avgDurationMs) {
      slowest = { title: step.title, avgDurationMs: step.avgDurationMs };
    }
  }
  return slowest;
}

// Slowest average first. Procedures without completed executions have no time and go last, in
// the order the API gives them. The slowest step is the one of the latest version, the one whose
// steps are in use.
export function procedureTimeRows(procedures: ProcedureMetricsResponse[]): ProcedureTimeRow[] {
  const longest = Math.max(0, ...procedures.map((p) => p.avgCompletionMs ?? 0));
  const rows = procedures.map(
    (procedure): ProcedureTimeRow => ({
      procedureId: procedure.procedureId,
      areaIds: procedure.areaIds,
      completed: procedure.completed,
      avgCompletionMs: procedure.avgCompletionMs,
      minCompletionMs: procedure.minCompletionMs,
      maxCompletionMs: procedure.maxCompletionMs,
      barRatio:
        procedure.avgCompletionMs === null || longest === 0
          ? 0
          : procedure.avgCompletionMs / longest,
      slowestStep: slowestStep(procedure.versions[0]?.steps ?? []),
    }),
  );
  return rows
    .map((row, index) => ({ row, index }))
    .sort(
      (a, b) =>
        (b.row.avgCompletionMs ?? -1) - (a.row.avgCompletionMs ?? -1) || a.index - b.index,
    )
    .map(({ row }) => row);
}
