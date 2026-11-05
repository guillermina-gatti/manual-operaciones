// Test data for the execution screen: "Cierre de caja" v2, the same ids as the API fixtures.
import type { ExecutionResponse } from '@/lib/api';

export const EXECUTION_ID = '1e000000-0000-4000-8000-000000000001';
export const CIERRE_DE_CAJA = '1a000000-0000-4000-8000-000000000001';
export const RECEPCION = '1a000000-0000-4000-8000-000000000002';

export const STEPS = [
  { stepId: '1c000000-0000-4000-8000-000000000011', title: 'Contar el efectivo' },
  { stepId: '1c000000-0000-4000-8000-000000000012', title: 'Contar los comprobantes de tarjeta' },
  { stepId: '1c000000-0000-4000-8000-000000000013', title: 'Comparar con el reporte del sistema' },
  { stepId: '1c000000-0000-4000-8000-000000000014', title: 'Guardar el efectivo en la caja fuerte' },
];

// 13:00 UTC = 10:00 in Buenos Aires. Each step takes 3 minutes.
const START = Date.parse('2026-10-27T13:00:00.000Z');
const STEP_MS = 3 * 60_000;
const at = (minutes: number) => new Date(START + minutes * 60_000).toISOString();

// The execution after `finished` steps were completed, as the API returns it: the steps
// after the current one have not started yet.
export function execution(finished: number): ExecutionResponse {
  const completed = finished >= STEPS.length;
  return {
    id: EXECUTION_ID,
    procedureId: CIERRE_DE_CAJA,
    procedureVersionId: '1b000000-0000-4000-8000-000000000002',
    status: completed ? 'COMPLETED' : 'IN_PROGRESS',
    startedAt: at(0),
    finishedAt: completed ? at(STEPS.length * 3) : null,
    currentStepId: completed ? null : STEPS[finished].stepId,
    steps: STEPS.map((step, i) => {
      const done = i < finished;
      const started = i <= finished;
      return {
        ...step,
        order: i + 1,
        startedAt: started ? at(i * 3) : null,
        finishedAt: done ? at((i + 1) * 3) : null,
        durationMs: done ? STEP_MS : null,
      };
    }),
  };
}
