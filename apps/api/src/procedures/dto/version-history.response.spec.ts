import {
  toVersionDetailResponse,
  toVersionHistoryItem,
  toVersionHistoryPage,
} from './version-history.response';
import type { VersionDetailRecord, VersionHistoryRecord } from '../versions.repository';

const PROCEDURE_ID = '1a000000-0000-4000-8000-000000000001';
const ADMIN_ID = '0b000000-0000-4000-8000-000000000001';

const record = (overrides: Partial<VersionHistoryRecord> = {}): VersionHistoryRecord => ({
  id: '1b000000-0000-4000-8000-000000000001',
  procedureId: PROCEDURE_ID,
  versionNumber: 1,
  status: 'DRAFT',
  title: 'Cierre de caja',
  createdAt: new Date('2026-11-01T10:00:00.000Z'),
  publishedAt: null,
  publishedById: null,
  isCritical: false,
  changeSummary: null,
  stepCount: 2,
  ...overrides,
});

describe('toVersionHistoryItem (spec 015, R8)', () => {
  it('a draft has no publication data', () => {
    const item = toVersionHistoryItem({ ...record(), publishedByName: null });

    expect(item).toEqual({
      id: '1b000000-0000-4000-8000-000000000001',
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
        status: 'PUBLISHED',
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
      ...record({ status: 'SUPERSEDED', publishedAt: new Date(), publishedById: ADMIN_ID }),
      publishedByName: null,
    });

    expect(item.publishedBy).toEqual({ id: ADMIN_ID, name: null });
  });

  it('does not show fields that are internal', () => {
    const item = toVersionHistoryItem({
      ...record({ createdById: ADMIN_ID } as Partial<VersionHistoryRecord>),
      publishedByName: null,
    });

    expect(Object.keys(item)).not.toContain('createdById');
  });
});

describe('toVersionDetailResponse (spec 015, R9)', () => {
  it('adds the description and the steps in order, with only their four fields', () => {
    const detail: VersionDetailRecord = {
      ...record({ status: 'SUPERSEDED' }),
      description: 'Al final del turno',
      steps: [
        { id: 's1', order: 1, title: 'Contar', description: '', stepKey: 'k1' } as VersionDetailRecord['steps'][number],
        { id: 's2', order: 2, title: 'Comparar', description: 'Con el reporte' },
      ],
    };

    const response = toVersionDetailResponse({ ...detail, publishedByName: null });

    expect(response.description).toBe('Al final del turno');
    expect(response.steps).toEqual([
      { id: 's1', order: 1, title: 'Contar', description: '' },
      { id: 's2', order: 2, title: 'Comparar', description: 'Con el reporte' },
    ]);
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
