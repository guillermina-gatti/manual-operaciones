// Directorio de usuarios simulado, sobre los fixtures, hasta que exista GET /api/users?areaIds=… (T29).
import { filterOwnerCandidates } from '@/lib/documents/owner-candidates';
import { FIXTURE_USERS } from './fixtures';
import type { FixtureUser } from './fixtures';
import type { DirectoryUser, UsersDirectory } from './users-directory';

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

interface Options {
  users?: FixtureUser[];
  // Demora de cada respuesta, para que el estado "cargando" se vea al probar a mano.
  delayMs?: number;
}

export function createFakeUsersDirectory({
  users = Object.values(FIXTURE_USERS),
  delayMs = 300,
}: Options = {}): UsersDirectory {
  return {
    async listOwnerCandidates(areaIds) {
      await wait(delayMs);
      // La API real devuelve { id, name, role }: las áreas de cada usuario no salen del directorio.
      return filterOwnerCandidates(users, areaIds).map(
        ({ id, name, role }): DirectoryUser => ({ id, name, role }),
      );
    },

    async getNames(ids) {
      await wait(delayMs);
      return Object.fromEntries(
        users.filter((user) => ids.includes(user.id)).map((user) => [user.id, user.name]),
      );
    },
  };
}
