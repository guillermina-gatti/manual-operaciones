/* Spec 011 (T06, R11): el par de una alerta, siempre en el mismo orden */
import { orderConflictPair } from './conflict-pair';

const LOW = {
  documentId: '0d000000-0000-4000-8000-00000000000a',
  versionId: 'v-low',
  chunkId: 'c-low',
};
const HIGH = {
  documentId: '0d000000-0000-4000-8000-00000000000b',
  versionId: 'v-high',
  chunkId: 'c-high',
};

describe('orderConflictPair (R11)', () => {
  it('E8: A es el documento de id menor, sin importar el orden de entrada', () => {
    expect(orderConflictPair(LOW, HIGH)).toEqual({ a: LOW, b: HIGH });
    expect(orderConflictPair(HIGH, LOW)).toEqual({ a: LOW, b: HIGH });
  });

  it('compara en minúsculas, como uuid < uuid en PostgreSQL', () => {
    const upper = { ...HIGH, documentId: HIGH.documentId.toUpperCase() };

    expect(orderConflictPair(upper, LOW)).toEqual({
      a: LOW,
      b: { ...upper, documentId: HIGH.documentId },
    });
  });

  it('el orden de texto coincide con el de los bytes del uuid', () => {
    const nine = { ...LOW, documentId: '9fffffff-0000-4000-8000-000000000000' };
    const a = { ...HIGH, documentId: 'a0000000-0000-4000-8000-000000000000' };

    expect(orderConflictPair(a, nine).a).toEqual(nine);
  });

  it('el mismo documento en los dos lados lanza (R2)', () => {
    expect(() => orderConflictPair(LOW, { ...LOW, versionId: 'otra' })).toThrow(
      /mismo documento/,
    );
  });
});
