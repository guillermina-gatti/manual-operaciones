// Answers of GET /api/metrics/me for the tests of the employee's own activity.
import type { MyMetricsResponse } from '@/lib/api';

export const VENTAS = '0a000000-0000-4000-8000-000000000001';
export const OPERACIONES = '0a000000-0000-4000-8000-000000000002';
export const CIERRE_DE_CAJA = '1a000000-0000-4000-8000-000000000001';
export const RECEPCION = '1a000000-0000-4000-8000-000000000002';
export const CURRENT_EXECUTION = '1e000000-0000-4000-8000-000000000001';
export const STALE_EXECUTION = '1e000000-0000-4000-8000-000000000002';

// Elena (Ventas and Operaciones): 5 started, 3 completed, 1 in progress and 1 without progress for
// more than 24 h. Cierre de caja at step 2 since 10:05 today; Recepción stuck at step 1 since 25/10.
export function myMetricsResponse(overrides: Partial<MyMetricsResponse> = {}): MyMetricsResponse {
  return {
    filters: { areaId: null, from: '2026-10-01', to: '2026-10-27' },
    staleAfterHours: 24,
    areaIds: [VENTAS, OPERACIONES],
    totals: { started: 5, completed: 3, inProgress: 1, abandoned: 1, avgCompletionMs: 600000 },
    resume: [
      {
        executionId: CURRENT_EXECUTION,
        procedureId: CIERRE_DE_CAJA,
        procedureVersionId: '1b000000-0000-4000-8000-000000000002',
        currentStep: {
          stepId: '1c000000-0000-4000-8000-000000000002',
          order: 2,
          title: 'Comparar con el reporte',
        },
        totalSteps: 4,
        startedAt: '2026-10-27T12:50:00.000Z',
        lastActivityAt: '2026-10-27T13:05:00.000Z',
        stale: false,
      },
      {
        executionId: STALE_EXECUTION,
        procedureId: RECEPCION,
        procedureVersionId: '1b000000-0000-4000-8000-000000000003',
        currentStep: {
          stepId: '1c000000-0000-4000-8000-000000000011',
          order: 1,
          title: 'Verificar el remito',
        },
        totalSteps: 3,
        startedAt: '2026-10-25T14:00:00.000Z',
        lastActivityAt: '2026-10-25T14:00:00.000Z',
        stale: true,
      },
    ],
    procedures: [
      {
        procedureId: CIERRE_DE_CAJA,
        areaIds: [VENTAS],
        started: 4,
        completed: 3,
        inProgress: 1,
        abandoned: 0,
        avgCompletionMs: 600000,
        lastStartedAt: '2026-10-27T12:50:00.000Z',
        slowestStep: {
          stepId: '1c000000-0000-4000-8000-000000000002',
          order: 2,
          title: 'Comparar con el reporte',
          avgDurationMs: 240000,
        },
      },
      {
        procedureId: RECEPCION,
        areaIds: [OPERACIONES],
        started: 1,
        completed: 0,
        inProgress: 0,
        abandoned: 1,
        avgCompletionMs: null,
        lastStartedAt: '2026-10-25T14:00:00.000Z',
        slowestStep: null,
      },
    ],
    ...overrides,
  };
}

export const EMPTY_MY_METRICS = myMetricsResponse({
  totals: { started: 0, completed: 0, inProgress: 0, abandoned: 0, avgCompletionMs: null },
  resume: [],
  procedures: [],
});
