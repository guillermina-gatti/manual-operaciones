import type { ProcedureMetricsView } from '../procedure-metrics.service';
import { toProceduresMetricsResponse } from './procedure-metrics.response';

const VENTAS = '0a000000-0000-4000-8000-000000000001';

const step = {
  stepId: '1c000000-0000-4000-8000-000000000004',
  order: 1,
  title: 'Contar el efectivo',
  reached: 2,
  finished: 1,
  avgDurationMs: 180000,
  abandoned: 1,
  abandonRate: 0.5,
};

const counts = { started: 2, completed: 1, inProgress: 0, abandoned: 1 };

const VIEW: ProcedureMetricsView = {
  filters: { areaId: VENTAS, from: '2026-10-01', to: null },
  staleAfterHours: 24,
  areaIds: [VENTAS],
  totals: { ...counts, completionRate: 0.5 },
  procedures: [
    {
      procedureId: '1a000000-0000-4000-8000-000000000001',
      areaIds: [VENTAS],
      ...counts,
      completionRate: 0.5,
      avgCompletionMs: 540000,
      versions: [
        {
          procedureVersionId: '1b000000-0000-4000-8000-000000000002',
          ...counts,
          steps: [step],
        },
      ],
    },
  ],
};

describe('toProceduresMetricsResponse', () => {
  it('maps every field', () => {
    expect(toProceduresMetricsResponse(VIEW)).toEqual(VIEW);
  });

  it('leaves out fields the response does not declare', () => {
    const withExtras = {
      ...VIEW,
      userIds: ['0b000000-0000-4000-8000-000000000003'],
      procedures: [
        {
          ...VIEW.procedures[0],
          userId: '0b000000-0000-4000-8000-000000000003',
          versions: [
            {
              ...VIEW.procedures[0].versions[0],
              steps: [{ ...step, executionIds: ['x'] }],
            },
          ],
        },
      ],
    } as unknown as ProcedureMetricsView;

    const json = JSON.stringify(toProceduresMetricsResponse(withExtras));

    expect(json).not.toContain('userId');
    expect(json).not.toContain('executionIds');
  });

  it('keeps null for an ADMIN, who may filter by any area', () => {
    expect(
      toProceduresMetricsResponse({ ...VIEW, areaIds: null }).areaIds,
    ).toBeNull();
  });
});
