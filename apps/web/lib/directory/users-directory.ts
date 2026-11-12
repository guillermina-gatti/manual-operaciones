// Usuarios que la web necesita conocer (plan 002, sección 3.3). La simulación y la versión real
// (GET /api/users?areaIds=…, de la pareja A) cumplen esta interfaz.
import type { Role } from '@/lib/session';

export interface DirectoryUser {
  id: string;
  name: string;
  role: Role;
}

export interface UsersDirectory {
  // Los usuarios activos que comparten al menos un área, más todos los ADMIN (F11).
  listOwnerCandidates(areaIds: string[]): Promise<DirectoryUser[]>;
  // Nombre de cada ID, para mostrar el responsable (Q1). Los IDs desconocidos no aparecen.
  getNames(ids: string[]): Promise<Record<string, string>>;
}
