// Puerto y tipos de datos para consultar la información y áreas de los usuarios.
import type { Role } from '../../common/auth';

export interface DirectoryUser {
  id: string;
  role: Role;
  areaIds: string[];
  // Estado vigente; los consumidores deben diferenciar asignaciones nuevas de referencias históricas.
  isActive: boolean;
}

export abstract class UsersDirectory {
  abstract findById(id: string): Promise<DirectoryUser | null>;
}
