/* Spec 008: las referencias a personas y áreas que llevan las respuestas de documentos, con su nombre
y su estado actuales (R1). Acá está solo lo que no consulta nada (plan 008, 1.1; PD1): qué IDs pide una
respuesta y cómo se arma cada referencia con lo que devolvieron los directorios. La búsqueda en lote
(DocumentReferences) espera UsersDirectory.findByIds, de la pareja A (T05). */

import type { DocumentRecord } from './documents.repository';

// Lo único que sale de una persona o un área (R3). name es null si el directorio no la encontró (R12).
export interface DocumentReference {
  id: string;
  name: string | null;
  isActive: boolean;
}

// Los IDs que necesita una respuesta, sin repetidos.
export interface ReferenceIds {
  userIds: string[];
  areaIds: string[];
}

// Lo mínimo que hace falta de lo que devuelve un directorio. Puede traer más campos (rol, áreas):
// nunca se copian.
interface Named {
  id: string;
  name: string;
  isActive: boolean;
}

// La referencia de lo que no se encontró (R12, PD4).
const notFound = (id: string): DocumentReference => ({
  id,
  name: null,
  isActive: false,
});

// Campo por campo: nada más del directorio llega a la respuesta (R3).
const toReference = ({ id, name, isActive }: Named): DocumentReference => ({
  id,
  name,
  isActive,
});

// Lo que ya se buscó, por ID. Usuarios y áreas por separado, aunque un ID coincida.
export class ReferenceLookup {
  private constructor(
    private readonly users: ReadonlyMap<string, DocumentReference>,
    private readonly areas: ReadonlyMap<string, DocumentReference>,
    private readonly searched: { users: Set<string>; areas: Set<string> },
  ) {}

  // `searched` son los IDs que se pidieron, aunque el directorio no haya devuelto alguno: para `has`
  // un ID buscado y no encontrado ya está resuelto (con la referencia de R12). Sin `searched`, cuentan
  // solo los encontrados.
  static from(
    users: Named[],
    areas: Named[],
    searched: ReferenceIds = { userIds: [], areaIds: [] },
  ): ReferenceLookup {
    const byId = (items: Named[]) =>
      new Map(items.map((item) => [item.id, toReference(item)]));
    const userMap = byId(users);
    const areaMap = byId(areas);
    return new ReferenceLookup(userMap, areaMap, {
      users: new Set([...userMap.keys(), ...searched.userIds]),
      areas: new Set([...areaMap.keys(), ...searched.areaIds]),
    });
  }

  user(id: string): DocumentReference {
    const found = this.users.get(id);
    return found ? { ...found } : notFound(id);
  }

  area(id: string): DocumentReference {
    const found = this.areas.get(id);
    return found ? { ...found } : notFound(id);
  }

  // Si todos esos IDs ya se buscaron. Sirve a las escrituras para pedir después solo lo que falte
  // (plan 008, 1.4; PD5).
  has(ids: ReferenceIds): boolean {
    return (
      ids.userIds.every((id) => this.searched.users.has(id)) &&
      ids.areaIds.every((id) => this.searched.areas.has(id))
    );
  }
}

// Los IDs de una respuesta con uno o más documentos: responsables y áreas de todos, y quien hizo la
// última revisión solo de los que llevan `review` (R3; PD3): de los demás ni siquiera se busca.
export function referenceIdsOf(
  items: Array<{ record: DocumentRecord; withReview: boolean }>,
): ReferenceIds {
  const userIds = new Set<string>();
  const areaIds = new Set<string>();
  for (const { record, withReview } of items) {
    userIds.add(record.ownerId);
    for (const areaId of record.areaIds) areaIds.add(areaId);
    if (withReview && record.lastReviewedById) {
      userIds.add(record.lastReviewedById);
    }
  }
  return { userIds: [...userIds], areaIds: [...areaIds] };
}
