// T28 y T29: directorios HTTP con la sesión vigente; A-06.4 (nombres históricos) sigue pendiente.
import { apiClient } from '@/lib/api';
import { createFakeUsersDirectory } from './fake-users-directory';
import { createHttpAreasDirectory } from './http-areas-directory';
import { createHttpUsersDirectory } from './http-users-directory';

// Solo getNames conserva temporalmente los fixtures hasta acordar e implementar A-06.4.
const legacyNamesDirectory = createFakeUsersDirectory();
export const usersDirectory = createHttpUsersDirectory(apiClient, legacyNamesDirectory);
export const areasDirectory = createHttpAreasDirectory(apiClient);

export type { Area, AreasDirectory } from './areas-directory';
export type { DirectoryUser, UsersDirectory } from './users-directory';
