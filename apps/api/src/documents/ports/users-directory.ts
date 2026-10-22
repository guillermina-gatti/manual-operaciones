import type { Role } from '../../common/auth';

export interface DirectoryUser {
  id: string;
  role: Role;
  areaIds: string[];
}

// Puerto (plan 5.3): sirve para el responsable (R5) y para las áreas del usuario actual (R10, D5).
export abstract class UsersDirectory {
  abstract findById(id: string): Promise<DirectoryUser | null>;
}
