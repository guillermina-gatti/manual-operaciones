import { record } from '../../../test/procedures/version-fixtures';
import { toVersionHistoryItem, toVersionHistoryPage } from './version-history.response';

const PROCEDURE_ID = '1a000000-0000-4000-8000-000000000001';
const ADMIN_ID = '0b000000-0000-4000-8000-000000000001';

// A draft, as the history shows it.
const draft = () => record({ status: 'DRAFT', publishedAt: null, publishedById: null, versionNumber: 1 });

describe('toVersionHistoryItem (spec 015, R8)', () => {
  it('a draft has no publication data', () => {
    const item = toVersionHistoryItem({ ...draft(), publishedByName: null });

    expect(item).toEqual({
      id: '1b000000-0000-4000-8000-000000000002',
      procedureId: PROCEDURE_ID,
      versionNumber: 1,
      status: 'DRAFT',
      title: 'Cierre de caja',
      createdAt: '2026-11-01T10:00:00.000Z',
      publishedAt: null,
      publishedBy: null,
      isCritical: false,
      changeSummary: null,
      stepCount: 2,
    });
  });

  it('a published one says when and by whom, with dates in ISO UTC', () => {
    const item = toVersionHistoryItem({
      ...record({
        publishedAt: new Date('2026-11-02T12:30:00.000Z'),
        publishedById: ADMIN_ID,
        isCritical: true,
        changeSummary: 'Cambia el límite de caja',
      }),
      publishedByName: 'Ana Administradora',
    });

    expect(item).toMatchObject({
      status: 'PUBLISHED',
      publishedAt: '2026-11-02T12:30:00.000Z',
      publishedBy: { id: ADMIN_ID, name: 'Ana Administradora' },
      isCritical: true,
      changeSummary: 'Cambia el límite de caja',
    });
  });

  it('keeps the id when the directory does not know the person (D6)', () => {
    const item = toVersionHistoryItem({
      ...record({ status: 'SUPERSEDED', publishedById: ADMIN_ID }),
      publishedByName: null,
    });

    expect(item.publishedBy).toEqual({ id: ADMIN_ID, name: null });
  });

  it('does not show fields that are internal', () => {
    const item = toVersionHistoryItem({
      ...record({ createdById: ADMIN_ID } as Partial<ReturnType<typeof record>>),
      publishedByName: null,
    });

    expect(Object.keys(item)).not.toContain('createdById');
  });
});

describe('toVersionHistoryPage (spec 015, R8)', () => {
  it('has the format of the team: data, total, page and limit', () => {
    const page = toVersionHistoryPage(
      { data: [{ ...record(), publishedByName: null }], total: 3 },
      2,
      1,
    );

    expect(page).toMatchObject({ total: 3, page: 2, limit: 1 });
    expect(page.data).toHaveLength(1);
  });
});
