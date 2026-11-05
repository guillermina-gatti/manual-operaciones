// Reglas del texto de búsqueda (spec 004, R4 y F2; plan 004, 5.1 y D11).
// Los mismos límites que la API: apps/api/src/documents/dto/search-documents.query.ts
// (SEARCH_MIN y SEARCH_MAX). Compartirlos en un paquete común queda para más adelante.

export const SEARCH_MIN = 3;
export const SEARCH_MAX = 100;

export type SearchParam =
  | { kind: 'none' }
  | { kind: 'invalid'; text: string }
  | { kind: 'valid'; text: string };

// Lee ?q= de la dirección (o lo escrito en la caja). Se cuenta sin los espacios de los extremos;
// los demás caracteres quedan tal cual: la API los trata como texto.
export function parseSearchParam(value: string | null | undefined): SearchParam {
  const text = (value ?? '').trim();
  if (text === '') return { kind: 'none' };
  if (text.length < SEARCH_MIN || text.length > SEARCH_MAX) return { kind: 'invalid', text };
  return { kind: 'valid', text };
}
