// Único punto de entrada de los directorios. Cuando la pareja A exponga GET /api/areas y
// GET /api/users?areaIds=…, se cambian solo estas dos líneas (T28 y T29; plan 002, sección 3.3).
import { createFakeAreasDirectory } from './fake-areas-directory';
import { createFakeUsersDirectory } from './fake-users-directory';

export const usersDirectory = createFakeUsersDirectory();
export const areasDirectory = createFakeAreasDirectory();

export type { Area, AreasDirectory } from './areas-directory';
export type { DirectoryUser, UsersDirectory } from './users-directory';
