import type { Role } from '../common/auth';
import type { DocumentStatus, Prisma } from '../generated/prisma/client';

// 1. Aquí definimos la estructura del usuario que solicita ver algo (su rol y sus áreas permitidas)
// (Nota: Las áreas no vienen de la sesión, las solicita un servicio externo a UsersDirectory)
export interface AccessSubject {
  role: Role;
  areaIds: string[];
}

// 2. Aquí definimos la estructura básica que debe tener un documento para evaluar su acceso
export interface AccessibleDocument {
  status: DocumentStatus;
  areaIds: string[];
}

// 3. Función auxiliar: Comprueba si el usuario y el documento comparten al menos un área en común
const sharesArea = (userAreaIds: string[], documentAreaIds: string[]) =>
  documentAreaIds.some((areaId) => userAreaIds.includes(areaId));

// 4. Valida si un usuario específico puede ver un documento en concreto
export function canView(
  viewer: AccessSubject,
  document: AccessibleDocument,
): boolean {
  // Si el usuario es Administrador, tiene acceso libre a todo
  if (viewer.role === 'ADMIN') return true;

  // Para los demás: el documento debe estar activo Y deben compartir al menos un área
  return (
    document.status === 'ACTIVE' && sharesArea(viewer.areaIds, document.areaIds)
  );
}

// 5. Crea un filtro dinámico para Prisma al listar documentos
export function listWhere(viewer: AccessSubject): Prisma.DocumentWhereInput {
  // Si es ADMIN, no aplica ningún filtro (trae todo)
  if (viewer.role === 'ADMIN') return {};

  // Si es usuario normal, filtra solo los activos y los que pertenecen a sus áreas
  return {
    status: 'ACTIVE',
    areas: { some: { areaId: { in: viewer.areaIds } } },
  };
}

// 6. Comprueba si un usuario puede ser propietario de algo basado en las áreas indicadas
export function canBeOwner(owner: AccessSubject, areaIds: string[]): boolean {
  return owner.role === 'ADMIN' || sharesArea(owner.areaIds, areaIds);
}
