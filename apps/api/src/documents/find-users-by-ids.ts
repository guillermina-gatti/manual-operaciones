/* Spec 008 (T05): búsqueda de varios usuarios a la vez, mientras el puerto no tenga findByIds. */

import type { DirectoryUser, UsersDirectory } from './ports/users-directory';

// TODO(spec 008): se reemplaza por UsersDirectory.findByIds cuando esté en develop (pareja A). Es el
// único lugar que lo usa: al reemplazarlo, se borra este archivo y su bloque de tests en
// document-references.spec.ts, y DocumentReferences.lookup llama a users.findByIds(userIds).
//
// Mismo comportamiento que confirmó la pareja A para findByIds: sin repetidos, activos e inactivos,
// y los IDs que no existen se omiten. Un findById por ID distinto, en paralelo. Si el directorio
// falla, el error pasa tal cual (RepositoryUnavailableError → 503 en el servicio).
export async function findUsersByIds(
  users: UsersDirectory,
  ids: string[],
): Promise<DirectoryUser[]> {
  const unique = [...new Set(ids)];
  const found = await Promise.all(unique.map((id) => users.findById(id)));
  return found.filter((user): user is DirectoryUser => user !== null);
}
