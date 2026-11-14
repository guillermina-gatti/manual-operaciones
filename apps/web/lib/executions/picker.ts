// The choices of the /ejecuciones picker, done in the browser: searching by title, the order of the
// cards and which executions are in progress (from "resume" of GET /api/metrics/me). The API is not
// asked again for any of it.
import type { MyResumeItem } from '@/lib/api';
import { matchesAreaSearch } from '@/lib/metrics/filters';
import { formatDuration } from './format';
import type { ExecutableProcedure } from './executable-procedures';

export type PickerSort = 'az' | 'fewer-steps' | 'more-steps' | 'in-progress';

export const SORT_OPTIONS: readonly { value: PickerSort; label: string }[] = [
  { value: 'az', label: 'A–Z' },
  { value: 'fewer-steps', label: 'Menos pasos primero' },
  { value: 'more-steps', label: 'Más pasos primero' },
  { value: 'in-progress', label: 'En curso primero' },
];

export const isPickerSort = (value: string): value is PickerSort =>
  SORT_OPTIONS.some((option) => option.value === value);

// The same criterion as the area search of the filters: any part of the title, without case or
// accents ("recepcion" finds "Recepción de mercadería").
export function matchesProcedureSearch(title: string, search: string): boolean {
  return matchesAreaSearch(title, search);
}

const byTitle = (a: ExecutableProcedure, b: ExecutableProcedure) =>
  a.title.localeCompare(b.title, 'es', { sensitivity: 'base' });

// Always A–Z inside each group, so the order never depends on what the API gave first.
export function sortProcedures(
  procedures: readonly ExecutableProcedure[],
  sort: PickerSort,
  inProgress: ReadonlyMap<string, MyResumeItem>,
): ExecutableProcedure[] {
  const compare = (a: ExecutableProcedure, b: ExecutableProcedure) => {
    switch (sort) {
      case 'fewer-steps':
        return a.stepCount - b.stepCount || byTitle(a, b);
      case 'more-steps':
        return b.stepCount - a.stepCount || byTitle(a, b);
      case 'in-progress':
        return Number(inProgress.has(b.id)) - Number(inProgress.has(a.id)) || byTitle(a, b);
      default:
        return byTitle(a, b);
    }
  };
  return [...procedures].sort(compare);
}

const time = (value: string) => {
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? -Infinity : ms;
};

// The executions in progress, newest first by their last move (the API already gives them so; this
// does not depend on it).
export function byLastActivity(resume: readonly MyResumeItem[]): MyResumeItem[] {
  return [...resume].sort((a, b) => time(b.lastActivityAt) - time(a.lastActivityAt));
}

// For each procedure, its execution in progress: the most recently moved one, if there were two.
export function inProgressByProcedure(
  resume: readonly MyResumeItem[],
): Map<string, MyResumeItem> {
  const map = new Map<string, MyResumeItem>();
  for (const item of byLastActivity(resume)) {
    if (!map.has(item.procedureId)) map.set(item.procedureId, item);
  }
  return map;
}

// "hace 20 min", from lastActivityAt (when the current step started: the last time it moved), in
// whole minutes so it does not tick seconds; under a minute says "1 min".
export function timeSince(value: string, now: Date = new Date()): string {
  const ms = now.getTime() - time(value);
  if (!Number.isFinite(ms)) return formatDuration(null);
  const minutes = Math.max(1, Math.floor(ms / 60_000));
  return formatDuration(minutes * 60_000);
}

export const stepsLabel = (count: number) => (count === 1 ? '1 paso' : `${count} pasos`);

export const proceduresLabel = (count: number) =>
  count === 1 ? '1 procedimiento' : `${count} procedimientos`;

export const moreInProgressLabel = (count: number) =>
  count === 1 ? 'Tenés 1 recorrido más en curso' : `Tenés ${count} recorridos más en curso`;
