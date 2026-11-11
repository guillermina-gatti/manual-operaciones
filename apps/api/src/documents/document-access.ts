/* Visibilidad de un documento para el usuario de la sesión, compartida por las consultas y por
"Marcar como revisado" (spec 005, D11). Movida tal cual desde DocumentQueryService (T08). */

import { NotFoundException } from '@nestjs/common';
import type { AuthUser } from '../common/auth';
import { AccessSubject, canView } from './document-access.policy';
import { DocumentRecord, DocumentsRepository } from './documents.repository';
import { UsersDirectory } from './ports/users-directory';

// R11 de la spec 001: el mismo error, con el mismo mensaje, para un documento inexistente y para uno
// no visible.
export const documentNotFound = () =>
  new NotFoundException('No se encontró el documento');

// El rol sale de la sesión; las áreas, del directorio y no del token (D5 del plan 001).
// Si el directorio falla, el error se propaga: nunca se lista sin filtro.

export async function viewerFor(
  users: UsersDirectory,
  user: AuthUser,
): Promise<AccessSubject> {
  // ADMIN conserva el acceso global definido por la política.
  if (user.role === 'ADMIN') {
    return { role: user.role, areaIds: [] };
  }

  // El directorio conserva las relaciones históricas.
  const found = await users.findById(user.id);

  // Un usuario inexistente o inactivo no recibe permisos.
  if (!found?.isActive) {
    return { role: user.role, areaIds: [] };
  }

  // El guard ya verificó qué áreas continúan activas.
  // Solo autorizamos las que también pertenecen al usuario.
  const activeAreaIds = new Set(user.areaIds);

  const authorizedAreaIds = found.areaIds.filter((areaId) =>
    activeAreaIds.has(areaId),
  );

  return {
    role: user.role,
    areaIds: authorizedAreaIds,
  };
}

// El documento, si existe y el usuario puede verlo; si no, 404.
export async function findVisibleDocument(
  users: UsersDirectory,
  documents: DocumentsRepository,
  user: AuthUser,
  id: string,
): Promise<DocumentRecord> {
  // Primero el visor y después el documento, siempre: si se cortara antes para un id inexistente,
  // la diferencia de tiempo revelaría qué documentos existen.
  const viewer = await viewerFor(users, user);
  const record = await documents.findByIdWithAreas(id);
  if (!record || !canView(viewer, record)) throw documentNotFound();
  return record;
}
