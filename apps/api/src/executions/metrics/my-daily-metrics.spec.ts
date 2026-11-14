import type { CatalogProcedureVersion } from '../ports/procedures-catalog';
import {
  DAILY_WINDOW_DAYS,
  buildDailyDays,
  buildDailyWeek,
  dailyPlan,
  nestMonday,
} from './my-daily-metrics';
import type { DailyCompletion } from './my-daily-metrics';

const ZONE = 'America/Argentina/Buenos_Aires';
const CIERRE = '1a000000-0000-4000-8000-000000000001';
const RECEPCION = '1a000000-0000-4000-8000-000000000002';
const CIERRE_V1 = '1b000000-0000-4000-8000-000000000001';
const CIERRE_V2 = '1b000000-0000-4000-8000-000000000002';
const RECEPCION_V1 = '1b000000-0000-4000-8000-000000000003';

const version = (
  procedureId: string,
  versionId: string,
  title?: string,
): CatalogProcedureVersion => ({
  procedureId,
  versionId,
  areaIds: [],
  steps: [],
  title,
});

const VERSIONS = new Map([
  [CIERRE_V1, version(CIERRE, CIERRE_V1, 'Cierre de caja (viejo)')],
  [CIERRE_V2, version(CIERRE, CIERRE_V2, 'Cierre de caja')],
  [RECEPCION_V1, version(RECEPCION, RECEPCION_V1, 'Recepción de mercadería')],
]);

const row = (
  day: string,
  procedureId: string,
  procedureVersionId: string,
  completed: number,
  lastCompletedAt = `${day}T15:00:00.000Z`,
): DailyCompletion => ({
  day,
  procedureId,
  procedureVersionId,
  completed,
  lastCompletedAt: new Date(lastCompletedAt),
});

describe('nestMonday', () => {
  it.each([
    ['Monday', '2026-11-09', '2026-11-09'],
    ['Wednesday', '2026-11-11', '2026-11-09'],
    ['Friday', '2026-11-13', '2026-11-09'],
    // The weekend shows the week that just ended.
    ['Saturday', '2026-11-14', '2026-11-09'],
    ['Sunday', '2026-11-15', '2026-11-09'],
    ['a Monday across a month', '2026-12-01', '2026-11-30'],
  ])('%s %s → %s', (_name, today, monday) => {
    expect(nestMonday(today)).toBe(monday);
  });
});

describe('dailyPlan', () => {
  it('21 days up to today in Buenos Aires, and the instants of each part', () => {
    // Friday 13 November 2026, 12:00 in Buenos Aires.
    const plan = dailyPlan(new Date('2026-11-13T15:00:00.000Z'), ZONE);

    expect(plan.days).toHaveLength(DAILY_WINDOW_DAYS);
    expect(plan.days[0]).toBe('2026-10-24');
    expect(plan.days.at(-1)).toBe('2026-11-13');
    expect(plan.week).toEqual({ from: '2026-11-09', to: '2026-11-13' });
    expect(plan.window).toEqual({
      timeZone: ZONE,
      completed: {
        from: new Date('2026-10-24T03:00:00.000Z'),
        to: new Date('2026-11-14T03:00:00.000Z'),
      },
      progress: {
        from: new Date('2026-11-09T03:00:00.000Z'),
        to: new Date('2026-11-14T03:00:00.000Z'),
      },
      week: {
        from: new Date('2026-11-09T03:00:00.000Z'),
        to: new Date('2026-11-16T03:00:00.000Z'),
      },
    });
  });

  it('"today" is the company day: 23:30 in Buenos Aires is already the next day in UTC', () => {
    // Thursday 12 November, 23:30 in Buenos Aires = Friday 13, 02:30 UTC.
    const plan = dailyPlan(new Date('2026-11-13T02:30:00.000Z'), ZONE);

    expect(plan.days.at(-1)).toBe('2026-11-12');
  });

  it('on Sunday the week is the one that just ended, and today is still in the chart', () => {
    const plan = dailyPlan(new Date('2026-11-15T15:00:00.000Z'), ZONE);

    expect(plan.week).toEqual({ from: '2026-11-09', to: '2026-11-13' });
    expect(plan.days.at(-1)).toBe('2026-11-15');
  });
});

describe('buildDailyDays', () => {
  const DAYS = ['2026-11-11', '2026-11-12', '2026-11-13'];

  it('every day, also the empty ones, in order', () => {
    const days = buildDailyDays(DAYS, [], VERSIONS);

    expect(days).toEqual([
      { date: '2026-11-11', procedures: [] },
      { date: '2026-11-12', procedures: [] },
      { date: '2026-11-13', procedures: [] },
    ]);
  });

  it('several procedures on a day: the most completed first, then by title', () => {
    const days = buildDailyDays(
      DAYS,
      [
        row('2026-11-12', RECEPCION, RECEPCION_V1, 1),
        row('2026-11-12', CIERRE, CIERRE_V2, 3),
        row('2026-11-13', RECEPCION, RECEPCION_V1, 1),
        row('2026-11-13', CIERRE, CIERRE_V2, 1),
      ],
      VERSIONS,
    );

    expect(days[1].procedures).toEqual([
      { procedureId: CIERRE, title: 'Cierre de caja', completed: 3 },
      {
        procedureId: RECEPCION,
        title: 'Recepción de mercadería',
        completed: 1,
      },
    ]);
    expect(days[2].procedures.map((p) => p.title)).toEqual([
      'Cierre de caja',
      'Recepción de mercadería',
    ]);
  });

  it('two versions of a procedure add up, with the title of the one completed last', () => {
    const days = buildDailyDays(
      DAYS,
      [
        row('2026-11-11', CIERRE, CIERRE_V1, 1, '2026-11-11T13:00:00.000Z'),
        row('2026-11-11', CIERRE, CIERRE_V2, 2, '2026-11-11T20:00:00.000Z'),
      ],
      VERSIONS,
    );

    expect(days[0].procedures).toEqual([
      { procedureId: CIERRE, title: 'Cierre de caja', completed: 3 },
    ]);
  });

  it('a version that is not visible (other area, unknown) is left out', () => {
    const days = buildDailyDays(
      DAYS,
      [row('2026-11-11', RECEPCION, RECEPCION_V1, 1)],
      new Map([[CIERRE_V2, VERSIONS.get(CIERRE_V2)!]]),
    );

    expect(days[0].procedures).toEqual([]);
  });

  it('a blank title is null', () => {
    const days = buildDailyDays(
      DAYS,
      [row('2026-11-11', CIERRE, CIERRE_V2, 1)],
      new Map([[CIERRE_V2, version(CIERRE, CIERRE_V2, '  ')]]),
    );

    expect(days[0].procedures[0].title).toBeNull();
  });
});

describe('buildDailyWeek', () => {
  const plan = dailyPlan(new Date('2026-11-13T15:00:00.000Z'), ZONE);

  it('Monday to Friday, without repeats, ascending', () => {
    expect(
      buildDailyWeek(plan, {
        progressDays: ['2026-11-12', '2026-11-09', '2026-11-12', '2026-11-14'],
        weekCompleted: 3,
      }),
    ).toEqual({
      from: '2026-11-09',
      to: '2026-11-13',
      activeDays: ['2026-11-09', '2026-11-12'],
      completedCount: 3,
    });
  });

  it('a week without progress', () => {
    expect(
      buildDailyWeek(plan, { progressDays: [], weekCompleted: 0 }),
    ).toEqual({
      from: '2026-11-09',
      to: '2026-11-13',
      activeDays: [],
      completedCount: 0,
    });
  });
});
