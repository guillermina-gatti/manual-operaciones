// T28, T29 y A-06.4: directorios HTTP con la sesión vigente.
import { apiClient } from '@/lib/api';
import { createHttpAreasDirectory } from './http-areas-directory';
import { createHttpUsersDirectory } from './http-users-directory';

export const usersDirectory = createHttpUsersDirectory(apiClient);
export const areasDirectory = createHttpAreasDirectory(apiClient);

export { displayAreaName, toAreaNameMap } from './areas-directory';
export type { Area, AreasDirectory } from './areas-directory';
export type { DirectoryUser, UsersDirectory } from './users-directory';
