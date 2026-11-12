/* El par de una alerta de contradicción, siempre en el mismo orden (spec 011, R11; plan 011, PD8).
Lo usan el registro del chat y la base, que lo exige con document_conflict_alerts_pair_order_check */

export interface ConflictSide {
  documentId: string;
  versionId: string;
  chunkId: string;
}

// A es el de documentId menor. En minúsculas, el orden del texto de un uuid es el de sus 16 bytes,
// que es como compara PostgreSQL (uuid < uuid). Lanza con el mismo documento: no es un par (R2).
export function orderConflictPair(
  x: ConflictSide,
  y: ConflictSide,
): { a: ConflictSide; b: ConflictSide } {
  const left = { ...x, documentId: x.documentId.toLowerCase() };
  const right = { ...y, documentId: y.documentId.toLowerCase() };
  if (left.documentId === right.documentId) {
    throw new Error(
      `Una alerta no puede ser del mismo documento dos veces (${left.documentId})`,
    );
  }
  return left.documentId < right.documentId
    ? { a: left, b: right }
    : { a: right, b: left };
}
