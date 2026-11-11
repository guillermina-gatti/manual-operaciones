// Puerto y tipos de datos para consultar la información y áreas de los usuarios.
import type { Role } from '../../common/auth';

export interface DirectoryUser {
  id: string;
  name: string;
  role: Role;
  areaIds: string[];
  // Estado vigente; los consumidores deben diferenciar asignaciones nuevas de referencias históricas.
  isActive: boolean;
}


export abstract class UsersDirectory {
  abstract findById(id: string): Promise<DirectoryUser | null>;

  /**
   * Busca varios usuarios por sus IDs.
   *
   * Contrato:
   * - No devuelve usuarios duplicados.
   * - Omite los IDs que no existen.
   * - Incluye usuarios activos e inactivos.
   * - Devuelve [] cuando no hay coincidencias.
   * - Propaga los errores del repositorio.
   *
   * Este método permite consultar referencias históricas
   * sin realizar una consulta individual por cada usuario.
   */
  abstract findByIds(ids: string[]): Promise<DirectoryUser[]>;
}

