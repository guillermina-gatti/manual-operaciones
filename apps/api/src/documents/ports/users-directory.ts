import type { Role } from '../../common/auth';

export interface DirectoryUser {
  id: string;
  role: Role;
  areaIds: string[];
}

// Puerto (plan 5.3): sirve para el responsable (R5) y para las áreas del usuario actual (R10, D5).
// La implementación real traduce sus fallos de conexión a RepositoryUnavailableError, así la carga
// y las consultas responden 503 (D13). Los demás errores no se traducen.
export abstract class UsersDirectory {
  abstract findById(id: string): Promise<DirectoryUser | null>;
}
