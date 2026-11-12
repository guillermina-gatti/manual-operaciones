import type { Comparison } from '../version-compare';
import { toCompareResponse } from './compare.response';

const comparison: Comparison = {
  from: { id: 'v1', versionNumber: 1, status: 'SUPERSEDED' },
  to: { id: 'v2', versionNumber: 2, status: 'PUBLISHED' },
  added: [{ id: 's3', order: 3, title: 'Guardar', description: '' }],
  removed: [{ id: 's2', order: 2, title: 'Cerrar', description: 'Con llave' }],
  modified: [
    {
      before: { id: 's1', order: 1, title: 'Contar', description: '' },
      after: { id: 's4', order: 1, title: 'Contar', description: 'Todo' },
      changedFields: ['description'],
    },
  ],
  unchanged: 5,
};

describe('toCompareResponse (spec 015, R10)', () => {
  it('has the two versions, the three lists and how many are unchanged', () => {
    expect(toCompareResponse(comparison)).toEqual(comparison);
  });

  it('copies field by field: nothing that is not in the response leaves', () => {
    const withExtra = {
      ...comparison,
      added: [{ ...comparison.added[0], key: 'internal' }],
    } as unknown as Comparison;

    expect(JSON.stringify(toCompareResponse(withExtra))).not.toContain('internal');
  });
});
