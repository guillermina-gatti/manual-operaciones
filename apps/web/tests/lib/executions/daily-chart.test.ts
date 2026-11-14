import { describe, expect, test } from 'vitest';
import {
  OTHERS_COLOR,
  OTHERS_KEY,
  SERIES_COLORS,
  axisDay,
  chartDays,
  chartSeries,
  completedLabel,
  dayAriaLabel,
  dayBoxTitle,
  procedureTotals,
  showsAxisLabel,
  tableDay,
  yScale,
} from '@/lib/executions/daily-chart';
import { dailyDays, procedure } from '../../support/my-daily';

const TODAY = '2026-11-13';

// n procedures, the i-th with i + 1 completed on Tuesday 3 Nov (so the first one has the fewest).
const many = (n: number) =>
  dailyDays(TODAY, {
    '2026-11-03': Array.from({ length: n }, (_, i) => procedure(i + 1, i + 1)),
  });

describe('chartSeries: colors and "Otros"', () => {
  test('0 procedures: no series', () => {
    expect(chartSeries(dailyDays(TODAY))).toEqual([]);
  });

  test('1 procedure: orange', () => {
    const [only] = chartSeries(many(1));
    expect(only).toMatchObject({ label: 'Procedimiento 1', color: SERIES_COLORS[0], total: 1 });
  });

  test('4 procedures: the four colors, the most completed first', () => {
    const series = chartSeries(many(4));
    expect(series.map((s) => [s.label, s.color])).toEqual([
      ['Procedimiento 4', 'var(--color-naranja)'],
      ['Procedimiento 3', 'var(--color-bosque)'],
      ['Procedimiento 2', '#EDA100'],
      ['Procedimiento 1', '#1BAF7A'],
    ]);
  });

  test('5 procedures: the one left keeps its name, in mud', () => {
    const series = chartSeries(many(5));
    expect(series).toHaveLength(5);
    expect(series[4]).toMatchObject({
      key: OTHERS_KEY,
      label: 'Procedimiento 1',
      color: OTHERS_COLOR,
    });
  });

  test('10 procedures: four colors and "Otros 6 procedimientos" with their total', () => {
    const series = chartSeries(many(10));
    expect(series).toHaveLength(5);
    expect(series[4]).toMatchObject({
      label: 'Otros 6 procedimientos',
      color: OTHERS_COLOR,
      total: 1 + 2 + 3 + 4 + 5 + 6,
    });
    expect(series[4].procedureIds).toHaveLength(6);
  });

  test('many with the same count: by name, so the colors never jump', () => {
    const days = dailyDays(TODAY, {
      '2026-11-03': [
        procedure(1, 2, 'Zeta'),
        procedure(2, 2, 'alfa'),
        procedure(3, 2, 'Beta'),
        procedure(4, 2, 'Ñandú'),
        procedure(5, 2, 'Gamma'),
        procedure(6, 2, 'Delta'),
      ],
    });
    expect(chartSeries(days).map((s) => s.label)).toEqual([
      'alfa',
      'Beta',
      'Delta',
      'Gamma',
      'Otros 2 procedimientos',
    ]);
  });

  test('the totals add every day of the window', () => {
    const days = dailyDays(TODAY, {
      '2026-11-02': [procedure(1, 1)],
      '2026-11-05': [procedure(1, 2), procedure(2, 4)],
    });
    expect(procedureTotals(days).map((p) => [p.name, p.total])).toEqual([
      ['Procedimiento 2', 4],
      ['Procedimiento 1', 3],
    ]);
  });

  test('a procedure without a title gets a name', () => {
    const days = dailyDays(TODAY, { '2026-11-02': [procedure(1, 1, null)] });
    expect(chartSeries(days)[0].label).toBe('Procedimiento sin nombre');
  });
});

describe('chartDays', () => {
  test('a day with several: the segments always in the order of the series', () => {
    const days = dailyDays(TODAY, {
      '2026-11-02': [procedure(1, 5)],
      '2026-11-03': [procedure(3, 1), procedure(1, 1), procedure(2, 2)],
    });
    const series = chartSeries(days);
    const tuesday = chartDays(days, series).find((d) => d.date === '2026-11-03')!;

    expect(tuesday.total).toBe(4);
    // Procedimiento 1 has the most in the window (6), then 2 (2), then 3 (1).
    expect(series.map((s) => s.label)).toEqual([
      'Procedimiento 1',
      'Procedimiento 2',
      'Procedimiento 3',
    ]);
    expect(tuesday.segments.map((s) => s.count)).toEqual([1, 2, 1]);
    expect(tuesday.segments.map((s) => s.color)).toEqual(series.map((s) => s.color));
    expect(tuesday.details.map((d) => d.name)).toEqual([
      'Procedimiento 2',
      'Procedimiento 1',
      'Procedimiento 3',
    ]);
  });

  test('an empty window: every day with 0', () => {
    const days = chartDays(dailyDays(TODAY), []);
    expect(days).toHaveLength(21);
    expect(days.every((d) => d.total === 0 && d.segments.length === 0)).toBe(true);
  });
});

describe('yScale', () => {
  test.each([
    [0, 4, [0, 1, 2, 3, 4]],
    [1, 4, [0, 1, 2, 3, 4]],
    [4, 4, [0, 1, 2, 3, 4]],
    [5, 6, [0, 2, 4, 6]],
    [17, 20, [0, 5, 10, 15, 20]],
    [43, 60, [0, 20, 40, 60]],
  ])('max %i → top %i, whole marks', (max, top, ticks) => {
    expect(yScale(max)).toEqual({ top, ticks });
  });

  test('never more than 5 marks, always whole, and the top covers the max', () => {
    for (let max = 0; max <= 300; max += 1) {
      const { top, ticks } = yScale(max);
      expect(ticks.length).toBeLessThanOrEqual(5);
      expect(ticks.every(Number.isInteger)).toBe(true);
      expect(top).toBeGreaterThanOrEqual(Math.max(max, 4));
      expect(ticks.at(-1)).toBe(top);
    }
  });
});

describe('the words', () => {
  const tuesday = chartDays(
    dailyDays(TODAY, {
      '2026-11-03': [procedure(1, 1, 'Hola2'), procedure(2, 1, 'Hola1'), procedure(3, 1, 'ejemplo2')],
    }),
    [],
  ).find((d) => d.date === '2026-11-03')!;

  test('the x axis: "24 oct"; every 2 days on a computer, every 3 on a phone', () => {
    expect(axisDay('2026-10-24')).toBe('24 oct');
    expect([0, 1, 2, 3, 4, 6].map((i) => showsAxisLabel(i, 2))).toEqual([true, false, true, false, true, true]);
    expect([0, 1, 2, 3, 6].map((i) => showsAxisLabel(i, 3))).toEqual([true, false, false, true, true]);
  });

  test('the box: "Martes 3 nov · 3 completadas"', () => {
    expect(dayBoxTitle(tuesday)).toBe('Martes 3 nov · 3 completadas');
    expect(completedLabel(1)).toBe('1 completada');
  });

  test('the screen reader: the whole day, the total and each procedure', () => {
    expect(dayAriaLabel(tuesday)).toBe(
      'martes 3 de noviembre: 3 completadas — ejemplo2 1, Hola1 1, Hola2 1',
    );
  });

  test('the rows of the table', () => {
    expect(tableDay('2026-11-08')).toBe('Domingo 8 nov');
  });
});
