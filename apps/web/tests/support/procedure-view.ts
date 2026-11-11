// Test data for the screens that list and read procedures (spec 006, HU11): what GET /api/procedures
// and GET /api/procedures/:id answer, and the sessions of each role.
import type {
  ProcedureAreaView,
  ProcedureDetail,
  ProcedureListItem,
  ProcedureListPage,
} from '@/lib/api/procedure-view';
import type { SessionState } from '@/lib/session';
import { OPERACIONES, PROCEDURE_ID, STEP_A, STEP_B, VENTAS, VERSION_ID } from './procedures';

export const VENTAS_AREA: ProcedureAreaView = { id: VENTAS, name: 'Ventas', isActive: true };
export const OPERACIONES_AREA: ProcedureAreaView = {
  id: OPERACIONES,
  name: 'Operaciones',
  isActive: true,
};

export const ELENA: SessionState = {
  user: { id: '0b000000-0000-4000-8000-000000000003', name: 'Elena Ventas', role: 'EMPLOYEE' },
  status: 'ready',
};
export const SUSANA: SessionState = {
  user: { id: '0b000000-0000-4000-8000-000000000002', name: 'Susana Supervisora', role: 'SUPERVISOR' },
  status: 'ready',
};

const T0 = '2026-11-01T10:00:00.000Z';

export function listItem(overrides: Partial<ProcedureListItem> = {}): ProcedureListItem {
  return {
    id: PROCEDURE_ID,
    createdAt: T0,
    version: {
      id: VERSION_ID,
      versionNumber: 1,
      status: 'PUBLISHED',
      title: 'Cierre de caja',
      description: 'Al final del día',
      stepCount: 2,
    },
    areas: [VENTAS_AREA],
    ...overrides,
  };
}

export const listPage = (data: ProcedureListItem[], total = data.length): ProcedureListPage => ({
  data,
  total,
  page: 1,
  limit: 12,
});

export function procedureDetail(overrides: Partial<ProcedureDetail> = {}): ProcedureDetail {
  return {
    id: PROCEDURE_ID,
    createdAt: T0,
    areas: [VENTAS_AREA, OPERACIONES_AREA],
    version: {
      id: VERSION_ID,
      versionNumber: 2,
      status: 'PUBLISHED',
      title: 'Cierre de caja',
      description: 'Al final del día',
      stepCount: 2,
      steps: [
        { id: STEP_A, order: 1, title: 'Contar el efectivo', description: 'Billetes y monedas' },
        { id: STEP_B, order: 2, title: 'Guardar el arqueo', description: '' },
      ],
    },
    ...overrides,
  };
}
