import type { MyMetricsView } from '../my-metrics.service';
import { toMyMetricsResponse } from './my-metrics.response';

const AT = new Date('2026-11-05T13:00:00.000Z');

describe('toMyMetricsResponse', () => {
  it('maps field by field: dates as ISO text, and nothing that was not asked for', () => {
    const view = {
      filters: { areaId: null, from: '2026-11-01', to: null, extra: 'x' },
      staleAfterHours: 24,
      areaIds: ['0a000000-0000-4000-8000-000000000001'],
      userId: 'must not leave',
      totals: {
        started: 2,
        completed: 1,
        inProgress: 1,
        abandoned: 0,
        avgCompletionMs: 600_000,
        others: 99,
      },
      resume: [
        {
          executionId: 'e',
          procedureId: 'p',
          procedureVersionId: 'v',
          currentStep: {
            stepId: 's',
            order: 2,
            title: 'Comparar',
            extra: true,
          },
          totalSteps: 4,
          startedAt: AT,
          lastActivityAt: AT,
          stale: false,
          userId: 'must not leave',
        },
      ],
      procedures: [
        {
          procedureId: 'p',
          areaIds: ['a'],
          started: 2,
          completed: 1,
          inProgress: 1,
          abandoned: 0,
          avgCompletionMs: 600_000,
          lastStartedAt: AT,
          slowestStep: {
            stepId: 's',
            order: 2,
            title: 'Comparar',
            avgDurationMs: 240_000,
          },
          versions: ['not in the response'],
        },
      ],
    } as unknown as MyMetricsView;

    expect(toMyMetricsResponse(view)).toStrictEqual({
      filters: { areaId: null, from: '2026-11-01', to: null },
      staleAfterHours: 24,
      areaIds: ['0a000000-0000-4000-8000-000000000001'],
      totals: {
        started: 2,
        completed: 1,
        inProgress: 1,
        abandoned: 0,
        avgCompletionMs: 600_000,
      },
      resume: [
        {
          executionId: 'e',
          procedureId: 'p',
          procedureVersionId: 'v',
          currentStep: { stepId: 's', order: 2, title: 'Comparar' },
          totalSteps: 4,
          startedAt: '2026-11-05T13:00:00.000Z',
          lastActivityAt: '2026-11-05T13:00:00.000Z',
          stale: false,
        },
      ],
      procedures: [
        {
          procedureId: 'p',
          areaIds: ['a'],
          started: 2,
          completed: 1,
          inProgress: 1,
          abandoned: 0,
          avgCompletionMs: 600_000,
          lastStartedAt: '2026-11-05T13:00:00.000Z',
          slowestStep: {
            stepId: 's',
            order: 2,
            title: 'Comparar',
            avgDurationMs: 240_000,
          },
        },
      ],
    });
  });

  it('a procedure without a slowest step keeps null', () => {
    const view = {
      filters: { areaId: null, from: null, to: null },
      staleAfterHours: 24,
      areaIds: [],
      totals: {
        started: 0,
        completed: 0,
        inProgress: 0,
        abandoned: 0,
        avgCompletionMs: null,
      },
      resume: [],
      procedures: [
        {
          procedureId: 'p',
          areaIds: [],
          started: 1,
          completed: 0,
          inProgress: 1,
          abandoned: 0,
          avgCompletionMs: null,
          lastStartedAt: AT,
          slowestStep: null,
        },
      ],
    } as MyMetricsView;

    expect(toMyMetricsResponse(view).procedures[0].slowestStep).toBeNull();
  });
});
