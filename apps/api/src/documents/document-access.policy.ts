import type { Role } from '../common/auth';
import type { DocumentStatus, Prisma } from '../generated/prisma/client';

// Las áreas del usuario no vienen de la sesión: las pide el servicio a UsersDirectory (D5).
export interface AccessSubject {
  role: Role;
  areaIds: string[];
}

export interface AccessibleDocument {
  status: DocumentStatus;
  areaIds: string[];
}

const sharesArea = (userAreaIds: string[], documentAreaIds: string[]) =>
  documentAreaIds.some((areaId) => userAreaIds.includes(areaId));

export function canView(
  viewer: AccessSubject,
  document: AccessibleDocument,
): boolean {
  if (viewer.role === 'ADMIN') return true;
  return (
    document.status === 'ACTIVE' && sharesArea(viewer.areaIds, document.areaIds)
  );
}

export function listWhere(viewer: AccessSubject): Prisma.DocumentWhereInput {
  if (viewer.role === 'ADMIN') return {};
  return {
    status: 'ACTIVE',
    areas: { some: { areaId: { in: viewer.areaIds } } },
  };
}

export function canBeOwner(owner: AccessSubject, areaIds: string[]): boolean {
  return owner.role === 'ADMIN' || sharesArea(owner.areaIds, areaIds);
}
