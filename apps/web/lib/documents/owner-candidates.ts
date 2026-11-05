// Quién puede ser responsable de un documento (F11). Es la misma regla que aplica la API (R5 de la spec 001),
// en apps/api/src/documents/document-access.policy.ts (canBeOwner): si cambia allá, cambia acá.
import type { Role } from '@/lib/session';

interface OwnerSubject {
  role: Role;
  areaIds: string[];
}

const sharesArea = (userAreaIds: string[], documentAreaIds: string[]) =>
  documentAreaIds.some((areaId) => userAreaIds.includes(areaId));

// Es ADMIN o comparte al menos un área con el documento. Sin áreas en el documento, solo un ADMIN.
export function canBeOwner(owner: OwnerSubject, areaIds: string[]): boolean {
  return owner.role === 'ADMIN' || sharesArea(owner.areaIds, areaIds);
}

// Se queda con los usuarios que pueden ser responsables, en el mismo orden.
export function filterOwnerCandidates<T extends OwnerSubject>(
  users: T[],
  areaIds: string[],
): T[] {
  return users.filter((user) => canBeOwner(user, areaIds));
}
