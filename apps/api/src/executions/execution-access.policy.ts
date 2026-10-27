/* Who can run a procedure and see an execution (spec 005, CA4) */

// The viewer can execute the procedure if they share at least one area with it.
// Areas come from UsersDirectory on every request, never from the session.
export function canAccessProcedure(
  viewerAreaIds: string[],
  procedureAreaIds: string[],
): boolean {
  return procedureAreaIds.some((areaId) => viewerAreaIds.includes(areaId));
}

// Only the user who started an execution can see or continue it; anyone else gets
// the same 404 as for an execution that does not exist.
export function isOwner(
  userId: string,
  execution: { userId: string },
): boolean {
  return execution.userId === userId;
}
