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

// Alcance de la búsqueda (spec 004, R3): por qué áreas se filtra. null = sin filtro (ADMIN).
// El estado ACTIVE no está acá: la búsqueda lo exige para todos, también para el ADMIN.
export interface SearchScope {
  areaIds: string[] | null;
}

// Crea el alcance de la búsqueda para el usuario. El repositorio solo lo traduce a SQL.
export function searchScope(viewer: AccessSubject): SearchScope {
  if (viewer.role === 'ADMIN') return { areaIds: null };
  return { areaIds: viewer.areaIds };
}

// Spec 005, R4 y R6: el estado de revisión lo ve, y "Marcar como revisado" lo puede usar, el ADMIN o
// el responsable. No mira áreas: para llegar acá el documento ya pasó canView.
export function canReview(
  user: { id: string; role: Role },
  document: { ownerId: string },
): boolean {
  return user.role === 'ADMIN' || document.ownerId === user.id;
}

// Spec 005, R5: los ACTIVE con la fecha de revisión hasta lastDay (hoy + 30) que el usuario puede
// revisar. El ADMIN, todos; los demás, los suyos que todavía puede ver (listWhere ya exige ACTIVE).
export function pendingReviewWhere(
  viewer: AccessSubject,
  userId: string,
  lastDay: Date,
): Prisma.DocumentWhereInput {
  if (viewer.role === 'ADMIN') {
    return { status: 'ACTIVE', reviewDate: { lte: lastDay } };
  }
  return {
    ...listWhere(viewer),
    ownerId: userId,
    reviewDate: { lte: lastDay },
  };
}

// 6. Comprueba si un usuario puede ser propietario de algo basado en las áreas indicadas
export function canBeOwner(owner: AccessSubject, areaIds: string[]): boolean {
  return owner.role === 'ADMIN' || sharesArea(owner.areaIds, areaIds);
}
