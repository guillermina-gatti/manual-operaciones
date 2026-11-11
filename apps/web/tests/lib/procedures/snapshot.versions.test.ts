import { describe, expect, test } from 'vitest';
import { withDraftVersion } from '@/lib/procedures/snapshot';
import { editable } from '../../support/procedures';
import { V2, versionDetail } from '../../support/versions';

describe('withDraftVersion (spec 015, T13)', () => {
  const draft = versionDetail({
    id: V2,
    versionNumber: 2,
    status: 'DRAFT',
    title: 'Cierre de caja v2',
    description: null,
    steps: [{ id: 's1', order: 1, title: 'Contar', description: 'Todo' }],
  });

  test('the copy now follows the new draft: its id, number, title, description and steps', () => {
    const next = withDraftVersion(editable({ areaIds: ['a1'] }), draft);

    expect(next).toMatchObject({
      versionId: V2,
      versionNumber: 2,
      title: 'Cierre de caja v2',
      description: null,
      steps: [{ id: 's1', order: 1, title: 'Contar', description: 'Todo' }],
    });
  });

  test('keeps what belongs to the procedure: its id, its areas and when it was created', () => {
    const before = editable({ areaIds: ['a1'] });

    const next = withDraftVersion(before, draft);

    expect(next).toMatchObject({ id: before.id, areaIds: ['a1'], createdAt: before.createdAt });
  });

  test('does not change the copy it receives', () => {
    const before = editable();

    withDraftVersion(before, draft);

    expect(before).toEqual(editable());
  });
});
