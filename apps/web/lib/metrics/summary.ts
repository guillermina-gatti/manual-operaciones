// Numbers of the general summary of the metrics panel (HU38) that the API does not give as such.
// They are computed from the procedures, never from the area cards: a procedure with two areas
// is shown in both, but it counts once here.
import type { ExecutionCounts, ProcedureMetricsResponse } from '@/lib/api';
import { formatCount, formatPercent } from './format';

// The average time of a completed execution, weighted by how many each procedure completed:
// Σ (average of the procedure × its completed) ÷ Σ completed. null without completed ones.
// For a group of procedures the API does not sum up (the area cards); the general summary uses
// totals.avgCompletionMs. The procedures' averages come rounded to the millisecond, so this can
// differ from the exact average by less than a millisecond.
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

// The headline of "Resumen general": "Se completaron 30 de las 36 ejecuciones del período"; the
// verb agrees with the completed ones ("Se completó 1 de…") and one execution reads "de 1 ejecución
// del período". Without executions the panel shows its empty state instead.
export function generalSummaryHeadline(completed: number, started: number): string {
  const verb = completed === 1 ? 'Se completó' : 'Se completaron';
  const of = started === 1 ? 'de 1 ejecución' : `de las ${formatCount(started)} ejecuciones`;
  return `${verb} ${formatCount(completed)} ${of} del período`;
}

// The words of the legend, singular and plural: "1 completada", "2 en curso", "4 abandonadas".
export const completedCountLabel = (count: number) =>
  `${formatCount(count)} ${count === 1 ? 'completada' : 'completadas'}`;
export const inProgressCountLabel = (count: number) => `${formatCount(count)} en curso`;
export const abandonedCountLabel = (count: number) =>
  `${formatCount(count)} ${count === 1 ? 'abandonada' : 'abandonadas'}`;

// A share as the hero says it, with a space before the sign: 0.111 → "11,1 %". null → "—".
export function spacedPercent(share: number | null): string {
  return formatPercent(share).replace(/%$/, ' %');
}
