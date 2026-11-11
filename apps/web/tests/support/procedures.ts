// Test data for the procedures screens (spec 006): the same ids as the API fixtures.
import { AREA_IDS } from '@/lib/directory/fixtures';
import type { ProcedureResponse, StepResponse } from '@/lib/api/procedures';
import type { EditableProcedure } from '@/lib/procedures/editable';
import type { SessionState } from '@/lib/session';

export const ADMIN_ID = '0b000000-0000-4000-8000-000000000001';
export const PROCEDURE_ID = '1a000000-0000-4000-8000-000000000001';
export const VERSION_ID = '1b000000-0000-4000-8000-000000000001';
export const STEP_A = '1c000000-0000-4000-8000-000000000001';
export const STEP_B = '1c000000-0000-4000-8000-000000000002';
export const STEP_C = '1c000000-0000-4000-8000-000000000003';

export const VENTAS = AREA_IDS.ventas;
export const OPERACIONES = AREA_IDS.operaciones;
// An area that was deactivated: it is not in the fixtures, the tests that need it add it.
export const ARCHIVO = '0a000000-0000-4000-8000-000000000003';

const T0 = '2026-11-01T10:00:00.000Z';

export const ANA: SessionState = {
  user: { id: ADMIN_ID, name: 'Ana Administradora', role: 'ADMIN' },
  status: 'ready',
};

// What POST /api/procedures answers: the procedure with its version 1 as a DRAFT, no steps or areas.
export function procedureResponse(overrides: Partial<ProcedureResponse> = {}): ProcedureResponse {
  return {
    id: PROCEDURE_ID,
    areaIds: [],
    createdAt: T0,
    updatedAt: T0,
    versions: [
      {
        id: VERSION_ID,
        procedureId: PROCEDURE_ID,
        versionNumber: 1,
        status: 'DRAFT',
        title: 'Cierre de caja',
        description: null,
        stepCount: 0,
        createdAt: T0,
        updatedAt: T0,
      },
    ],
    ...overrides,
  };
}

export function stepResponse(
  id: string,
  order: number,
  title: string,
  description = '',
): StepResponse {
  return { id, procedureVersionId: VERSION_ID, order, title, description };
}

// A procedure as the editor holds it: what GET /api/procedures/:id answered plus the changes the API accepted.
export function editable(overrides: Partial<EditableProcedure> = {}): EditableProcedure {
  return {
    id: PROCEDURE_ID,
    versionId: VERSION_ID,
    versionNumber: 1,
    title: 'Cierre de caja',
    description: null,
    areaIds: [],
    steps: [],
    createdAt: T0,
    ...overrides,
  };
}
