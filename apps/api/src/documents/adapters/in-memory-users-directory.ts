/* Directorio de usuarios en memoria*/
import { DirectoryUser, UsersDirectory } from '../ports/users-directory';
import { FIXTURE_USERS } from './fixtures';

// Simulación hasta que la otra pareja exponga sus usuarios (plan 5.3).
// Sin @Injectable: Nest la construye sin argumentos y toma los fixtures.
export class InMemoryUsersDirectory extends UsersDirectory {
  private readonly users: Map<string, DirectoryUser>;

  constructor(users: DirectoryUser[] = Object.values(FIXTURE_USERS)) {
    super();
    this.users = new Map(users.map((user) => [user.id, user]));
  }

  findById(id: string): Promise<DirectoryUser | null> {
    const user = this.users.get(id);
    // Copia, para que quien llama no pueda cambiar los datos del directorio.
    return Promise.resolve(
      user ? { ...user, areaIds: [...user.areaIds] } : null,
    );
  }
}
