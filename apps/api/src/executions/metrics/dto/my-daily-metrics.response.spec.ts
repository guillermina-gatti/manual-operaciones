import type { MyDailyView } from '../my-metrics.service';
import { toMyDailyMetricsResponse } from './my-daily-metrics.response';

describe('toMyDailyMetricsResponse', () => {
  it('maps field by field, and nothing that was not asked for', () => {
    const view = {
      windowFrom: '2026-10-24',
      windowTo: '2026-11-13',
      userId: 'must not leave',
      days: [
        {
          date: '2026-11-13',
          extra: true,
          procedures: [
            {
              procedureId: 'p',
              title: 'Cierre de caja',
              completed: 2,
              procedureVersionId: 'must not leave',
            },
          ],
        },
        { date: '2026-11-12', procedures: [] },
      ],
      week: {
        from: '2026-11-09',
        to: '2026-11-13',
        activeDays: ['2026-11-09'],
        completedCount: 2,
        userId: 'must not leave',
      },
    } as unknown as MyDailyView;

    expect(toMyDailyMetricsResponse(view)).toEqual({
      windowFrom: '2026-10-24',
      windowTo: '2026-11-13',
      days: [
        {
          date: '2026-11-13',
          procedures: [
            { procedureId: 'p', title: 'Cierre de caja', completed: 2 },
          ],
        },
        { date: '2026-11-12', procedures: [] },
      ],
      week: {
        from: '2026-11-09',
        to: '2026-11-13',
        activeDays: ['2026-11-09'],
        completedCount: 2,
      },
    });
  });
});
