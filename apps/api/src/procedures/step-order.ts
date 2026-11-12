/* Pure rules for the order of the steps of a version (spec 006, R7 and R8) */

// The steps of a version as the list of their ids, from first to last. The order of a step is its
// place in the list plus one, so a numbering 1..n without gaps (R7) holds by construction.
// None of these functions changes the list it receives.
type StepIds = readonly string[];

// R7: the new step goes at the end, or at `position` (1..n + 1) pushing the following ones down
// one place. null when the position is not an integer inside that range.
export function insertStep(
  ids: StepIds,
  newId: string,
  position?: number,
): string[] | null {
  const at = position ?? ids.length + 1;
  if (!Number.isInteger(at) || at < 1 || at > ids.length + 1) return null;
  return [...ids.slice(0, at - 1), newId, ...ids.slice(at - 1)];
}

// R7: the following steps move up one place. null when the step is not in the list.
export function removeStep(ids: StepIds, id: string): string[] | null {
  const index = ids.indexOf(id);
  if (index === -1) return null;
  return [...ids.slice(0, index), ...ids.slice(index + 1)];
}

// R8: the requested order must hold exactly the current steps, once each. Returns a copy of it,
// or null when a step is missing, repeated, extra or not from the version.
export function reorderSteps(
  ids: StepIds,
  requested: StepIds,
): string[] | null {
  if (requested.length !== ids.length) return null;
  const known = new Set(ids);
  if (new Set(requested).size !== requested.length) return null;
  return requested.every((id) => known.has(id)) ? [...requested] : null;
}

// The order numbers (1..n) that the repository writes for a list.
export function numberSteps(
  ids: StepIds,
): { id: string; order: number }[] {
  return ids.map((id, index) => ({ id, order: index + 1 }));
}
