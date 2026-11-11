import { toProcedureDetailResponse, toProcedureListPage } from './procedure-view.response';
import type { ProcedureDetailView, ProcedureListItemView } from '../procedure-view';

const T0 = new Date('2026-11-01T10:00:00.000Z');
const AREA = { id: '0a000000-0000-4000-8000-000000000001', name: 'Ventas', isActive: true };
const SHOWN = {
  id: '1b000000-0000-4000-8000-000000000002',
  versionNumber: 2,
  status: 'PUBLISHED' as const,
  title: 'Cierre de caja',
  description: null,
  stepCount: 2,
};

describe('toProcedureListPage (spec 006, R16, P21)', () => {
  const item = (extra: Partial<ProcedureListItemView> = {}): ProcedureListItemView => ({
    id: 'p1',
    createdAt: T0,
    shown: SHOWN,
    areas: [AREA],
    ...extra,
  });

  it('R16: has the form { data, total, page, limit } with ISO dates', () => {
    const page = toProcedureListPage({ data: [item()], total: 41 }, 3, 20);

    expect(page).toMatchObject({ total: 41, page: 3, limit: 20 });
    expect(page.data[0]).toEqual({
      id: 'p1',
      createdAt: '2026-11-01T10:00:00.000Z',
      version: SHOWN,
      areas: [AREA],
    });
  });

  it('P21: hasOpenDraft goes out only when the service gave it', () => {
    const [withDraft, without] = toProcedureListPage(
      { data: [item({ hasOpenDraft: false }), item()], total: 2 },
      1,
      20,
    ).data;

    expect(withDraft.hasOpenDraft).toBe(false);
    expect(without).not.toHaveProperty('hasOpenDraft');
  });
});

describe('toProcedureDetailResponse (spec 006, P22)', () => {
  const detail = (extra: Partial<ProcedureDetailView> = {}): ProcedureDetailView => ({
    id: 'p1',
    createdAt: T0,
    areas: [AREA],
    version: { ...SHOWN, steps: [{ id: 's1', order: 1, title: 'Contar', description: '' }] },
    ...extra,
  });

  it('gives the version with its steps and the areas, with an ISO date', () => {
    const response = toProcedureDetailResponse(detail());

    expect(response).toEqual({
      id: 'p1',
      createdAt: '2026-11-01T10:00:00.000Z',
      areas: [AREA],
      version: { ...SHOWN, steps: [{ id: 's1', order: 1, title: 'Contar', description: '' }] },
    });
  });

  it('hasOpenDraft goes out only when the service gave it', () => {
    expect(toProcedureDetailResponse(detail({ hasOpenDraft: true })).hasOpenDraft).toBe(true);
    expect(toProcedureDetailResponse(detail())).not.toHaveProperty('hasOpenDraft');
  });
});
