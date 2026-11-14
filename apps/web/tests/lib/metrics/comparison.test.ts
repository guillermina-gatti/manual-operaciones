import { describe, expect, test } from 'vitest';
import {
  comparedPeriodLabel,
  compareSummary,
  previousPeriod,
} from '@/lib/metrics/comparison';
import type { ComparedTotals } from '@/lib/metrics/comparison';

const totals = (overrides: Partial<ComparedTotals> = {}): ComparedTotals => ({
  started: 20,
  completed: 16,
  inProgress: 2,
  abandoned: 2,
  avgCompletionMs: 600_000,
  ...overrides,
});

describe('previousPeriod', () => {
  test('13 days, 1 to 13 November: 19 to 31 October', () => {
    expect(previousPeriod('2026-11-01', '2026-11-13')).toEqual({
      from: '2026-10-19',
      to: '2026-10-31',
    });
  });

  test('one day (from = to, "Hoy"): the day before', () => {
    expect(previousPeriod('2026-11-13', '2026-11-13')).toEqual({
      from: '2026-11-12',
      to: '2026-11-12',
    });
  });

  test('across months of different lengths', () => {
    // 1 to 31 March, 31 days: 29 January to 28 February.
    expect(previousPeriod('2026-03-01', '2026-03-31')).toEqual({
      from: '2026-01-29',
      to: '2026-02-28',
    });
    // A leap year keeps its 29 February.
    expect(previousPeriod('2028-03-01', '2028-03-02')).toEqual({
      from: '2028-02-28',
      to: '2028-02-29',
    });
  });

  test('across the year', () => {
    expect(previousPeriod('2026-01-01', '2026-01-10')).toEqual({
      from: '2025-12-22',
      to: '2025-12-31',
    });
  });

  test('without one of the dates, with them backwards or invalid: nothing to compare', () => {
    expect(previousPeriod(null, '2026-11-13')).toBeNull();
    expect(previousPeriod('2026-11-01', null)).toBeNull();
    expect(previousPeriod('2026-11-13', '2026-11-01')).toBeNull();
    expect(previousPeriod('2026-02-30', '2026-03-02')).toBeNull();
  });
});

describe('comparedPeriodLabel', () => {
  test('the days without the year; one day alone; across years, with them', () => {
    expect(comparedPeriodLabel({ from: '2026-10-19', to: '2026-10-31' })).toBe('19 oct – 31 oct');
    expect(comparedPeriodLabel({ from: '2026-11-12', to: '2026-11-12' })).toBe('12 nov');
    expect(comparedPeriodLabel({ from: '2025-12-22', to: '2026-01-02' })).toBe(
      '22 dic 2025 – 2 ene 2026',
    );
  });
});

describe('compareSummary', () => {
  test('each number with its arrow and its words', () => {
    const result = compareSummary(
      totals({ started: 23, completed: 17, abandoned: 4, avgCompletionMs: 840_000 }),
      totals(),
    );
    if (result.kind !== 'compared') throw new Error('expected a comparison');
    expect(result.started.text).toBe('▲ 3 más que el período anterior');
    expect(result.started.short).toBe('3 más');
    // 80 % → 73,9 %.
    expect(result.completedRate.text).toBe('▼ 6,1 puntos de completadas menos');
    expect(result.abandoned.text).toBe('▲ 2 abandonadas más');
    expect(result.avgCompletion.text).toBe('▲ 4 min más lento');
  });

  test('only more abandoned and slower are worse; going down is not', () => {
    const worse = compareSummary(totals({ abandoned: 3, avgCompletionMs: 660_000 }), totals());
    const better = compareSummary(totals({ abandoned: 1, avgCompletionMs: 540_000 }), totals());
    if (worse.kind !== 'compared' || better.kind !== 'compared') throw new Error('expected both');
    expect([worse.abandoned.worse, worse.avgCompletion.worse]).toEqual([true, true]);
    expect(worse.abandoned.text).toBe('▲ 1 abandonada más');
    expect([better.abandoned.worse, better.avgCompletion.worse]).toEqual([false, false]);
    expect(better.abandoned.text).toBe('▼ 1 abandonada menos');
    expect(better.avgCompletion.text).toBe('▼ 1 min más rápido');
    expect(worse.started.worse).toBe(false);
  });

  test('the same: "= igual"', () => {
    const result = compareSummary(totals(), totals());
    if (result.kind !== 'compared') throw new Error('expected a comparison');
    expect(
      [result.started, result.completedRate, result.abandoned, result.avgCompletion].map(
        (change) => change.text,
      ),
    ).toEqual(['= igual', '= igual', '= igual', '= igual']);
  });

  test('the time in whole seconds: less than half a second apart is the same', () => {
    const result = compareSummary(totals({ avgCompletionMs: 600_400 }), totals());
    if (result.kind !== 'compared') throw new Error('expected a comparison');
    expect(result.avgCompletion.direction).toBe('same');
  });

  test('the period before without executions: nothing to compare, no division by 0', () => {
    expect(
      compareSummary(
        totals(),
        totals({ started: 0, completed: 0, inProgress: 0, abandoned: 0, avgCompletionMs: null }),
      ),
    ).toEqual({ kind: 'empty' });
  });

  test('from 0 to some: the number, never a percent', () => {
    const result = compareSummary(totals({ abandoned: 3 }), totals({ abandoned: 0 }));
    if (result.kind !== 'compared') throw new Error('expected a comparison');
    expect(result.abandoned.text).toBe('▲ 3 abandonadas más');
    expect(result.abandoned.text).not.toMatch(/%|Infinity|NaN/);
  });

  test('from no completed to some: 0 points before, never NaN', () => {
    const result = compareSummary(
      totals({ started: 4, completed: 2 }),
      totals({ started: 3, completed: 0, avgCompletionMs: null }),
    );
    if (result.kind !== 'compared') throw new Error('expected a comparison');
    expect(result.completedRate.text).toBe('▲ 50 puntos de completadas más');
  });

  test('a null average time on either side says why, without an arrow', () => {
    const now = compareSummary(totals({ completed: 0, avgCompletionMs: null }), totals());
    const before = compareSummary(totals(), totals({ avgCompletionMs: null }));
    if (now.kind !== 'compared' || before.kind !== 'compared') throw new Error('expected both');
    expect(now.avgCompletion).toMatchObject({
      direction: 'none',
      text: 'Sin completadas para comparar',
    });
    expect(before.avgCompletion).toMatchObject({
      direction: 'none',
      text: 'Sin completadas en el período anterior',
    });
  });

  test('one point, in singular', () => {
    const result = compareSummary(
      totals({ started: 100, completed: 81 }),
      totals({ started: 100, completed: 80 }),
    );
    if (result.kind !== 'compared') throw new Error('expected a comparison');
    expect(result.completedRate.text).toBe('▲ 1 punto de completadas más');
  });
});
