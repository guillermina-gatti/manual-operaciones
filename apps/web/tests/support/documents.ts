// Spec 008: las referencias con nombre que manda la API (owner, areas, lastReviewedBy, uploadedBy),
// armadas con los fixtures para los datos de prueba. Imports relativos: lo usa también Playwright
// (e2e/support/mock-api.ts), que no resuelve el alias "@/".
import type { DocumentReference, DocumentReview } from '../../lib/api/documents';
import { AREAS, FIXTURE_USERS } from '../../lib/directory/fixtures';

const USERS = Object.values(FIXTURE_USERS);

// Una persona de los fixtures por su ID, activa salvo que se diga otra cosa. Un ID que no está en los
// fixtures da name null, como un usuario que la API no encontró (R12).
export function personRef(id: string, isActive = true): DocumentReference {
  return { id, name: USERS.find((user) => user.id === id)?.name ?? null, isActive };
}

export function areaRef(id: string, isActive = true): DocumentReference {
  return { id, name: AREAS.find((area) => area.id === id)?.name ?? null, isActive };
}

// owner y areas a partir de ownerId y areaIds, para sumarlos a un documento de prueba.
export function referencesOf(
  ownerId: string,
  areaIds: string[],
): { owner: DocumentReference; areas: DocumentReference[] } {
  return { owner: personRef(ownerId), areas: areaIds.map((id) => areaRef(id)) };
}

// El bloque review con lastReviewedBy armado desde lastReviewedById.
export function reviewOf(review: Omit<DocumentReview, 'lastReviewedBy'>): DocumentReview {
  return {
    ...review,
    lastReviewedBy: review.lastReviewedById ? personRef(review.lastReviewedById) : null,
  };
}
