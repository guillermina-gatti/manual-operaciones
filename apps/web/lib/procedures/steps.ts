// The order of the steps of a draft (spec 006, R7 and R8).

export type Direction = 'up' | 'down';

// The ids of every step in the new order after moving one step one place, which is what the API
// asks for to reorder (R8). null if the step is not there, or it is already first or last.
export function moveStep(
  steps: readonly { id: string; order: number }[],
  stepId: string,
  direction: Direction,
): string[] | null {
  const ids = [...steps].sort((a, b) => a.order - b.order).map((step) => step.id);
  const from = ids.indexOf(stepId);
  if (from === -1) return null;

  const to = direction === 'up' ? from - 1 : from + 1;
  if (to < 0 || to >= ids.length) return null;

  [ids[from], ids[to]] = [ids[to], ids[from]];
  return ids;
}
