// Answers of GET /api/metrics/procedures for the panel tests.
import type { ProceduresMetricsResponse, StepMetricsResponse } from '@/lib/api';

export const VENTAS = '0a000000-0000-4000-8000-000000000001';
export const OPERACIONES = '0a000000-0000-4000-8000-000000000002';
export const CIERRE_DE_CAJA = '1a000000-0000-4000-8000-000000000001';
export const RECEPCION = '1a000000-0000-4000-8000-000000000002';

const step = (
  order: number,
  title: string,
  values: Partial<StepMetricsResponse> = {},
): StepMetricsResponse => ({
  stepId: `1c000000-0000-4000-8000-00000000000${order}`,
  order,
  title,
  reached: 4,
  finished: 4,
  avgDurationMs: 180000,
  abandoned: 0,
  abandonRate: 0,
  ...values,
});

// Cierre de caja (Ventas): 4 started, 2 completed, 1 in progress and 1 abandoned at step 2,
// with an older version. Recepción (Operaciones): 1 completed.
export function metricsResponse(
  overrides: Partial<ProceduresMetricsResponse> = {},
): ProceduresMetricsResponse {
  return {
    filters: { areaId: null, from: '2026-09-28', to: '2026-10-27' },
    staleAfterHours: 24,
    areaIds: null,
    totals: { started: 5, completed: 3, inProgress: 1, abandoned: 1, completionRate: 0.6 },
    procedures: [
      {
        procedureId: CIERRE_DE_CAJA,
        areaIds: [VENTAS],
        started: 4,
        completed: 2,
        inProgress: 1,
        abandoned: 1,
        completionRate: 0.5,
        avgCompletionMs: 720000,
        versions: [
          {
            procedureVersionId: '1b000000-0000-4000-8000-000000000002',
            started: 3,
            completed: 1,
            inProgress: 1,
            abandoned: 1,
            steps: [
              step(1, 'Contar el efectivo'),
              step(2, 'Comparar con el reporte', {
                finished: 2,
                avgDurationMs: 200000,
                abandoned: 1,
                abandonRate: 0.25,
              }),
              step(3, 'Guardar en la caja fuerte', {
                reached: 0,
                finished: 0,
                avgDurationMs: null,
                abandonRate: null,
              }),
            ],
          },
          {
            procedureVersionId: '1b000000-0000-4000-8000-000000000001',
            started: 1,
            completed: 1,
            inProgress: 0,
            abandoned: 0,
            steps: [step(1, 'Contar el efectivo (v1)', { reached: 1, finished: 1 })],
          },
        ],
      },
      {
        procedureId: RECEPCION,
        areaIds: [OPERACIONES],
        started: 1,
        completed: 1,
        inProgress: 0,
        abandoned: 0,
        completionRate: 1,
        avgCompletionMs: 300000,
        versions: [
          {
            procedureVersionId: '1b000000-0000-4000-8000-000000000003',
            started: 1,
            completed: 1,
            inProgress: 0,
            abandoned: 0,
            steps: [step(1, 'Revisar el remito', { reached: 1, finished: 1 })],
          },
        ],
      },
    ],
    ...overrides,
  };
}

export const EMPTY_METRICS: ProceduresMetricsResponse = metricsResponse({
  totals: { started: 0, completed: 0, inProgress: 0, abandoned: 0, completionRate: null },
  procedures: [],
});
