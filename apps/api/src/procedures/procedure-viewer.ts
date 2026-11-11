/* Who is asking, for the reads of procedures (spec 006, R15 and P20) */
import type { AuthUser } from '../common/auth';
import { UsersDirectory } from '../documents/ports/users-directory';
import type { ProcedureViewer } from './procedure-access.policy';

// The role comes from the session. The areas are the ones of the directory that the session also
// has: the guard already left out the inactive areas (P20), so a deactivated area gives no access.
// An ADMIN does not need areas. If the directory fails, the error goes up: access is never granted
// by default.
export async function procedureViewerFor(
  users: UsersDirectory,
  user: AuthUser,
): Promise<ProcedureViewer> {
  if (user.role === 'ADMIN') return { role: user.role, areaIds: [] };

  const found = await users.findById(user.id);
  if (!found?.isActive) return { role: user.role, areaIds: [] };

  const active = new Set(user.areaIds);
  return {
    role: user.role,
    areaIds: found.areaIds.filter((areaId) => active.has(areaId)),
  };
}
