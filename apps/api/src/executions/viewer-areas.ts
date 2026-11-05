/* The areas that grant access to the viewer right now (permissions matrix, "Área inactiva") */
import { AreasDirectory } from '../documents/ports/areas-directory';
import { UsersDirectory } from '../documents/ports/users-directory';

// Areas come from the directories on every request, never from the session. Like the
// guard, only active areas count: a deactivated area keeps its links but grants nothing.
// A user the directory does not know, or an inactive one, has no areas.
export async function activeAreaIdsOf(
  users: UsersDirectory,
  areas: AreasDirectory,
  userId: string,
): Promise<string[]> {
  const user = await users.findById(userId);
  if (!user?.isActive || user.areaIds.length === 0) return [];
  const found = await areas.findByIds(user.areaIds);
  return found.filter((area) => area.isActive).map((area) => area.id);
}
