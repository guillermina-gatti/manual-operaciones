// Punto de entrada de los directorios: T28 usa el catálogo HTTP real con la sesión vigente.
// T29 (candidatos) y A-06.4 (nombres históricos) se integran en PR separados.
import { apiClient } from '@/lib/api';
import { createFakeUsersDirectory } from './fake-users-directory';
import { createHttpAreasDirectory } from './http-areas-directory';

export const usersDirectory = createFakeUsersDirectory();
export const areasDirectory = createHttpAreasDirectory(apiClient);

export type { Area, AreasDirectory } from './areas-directory';
export type { DirectoryUser, UsersDirectory } from './users-directory';
