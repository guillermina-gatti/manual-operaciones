import { describe, expect, test } from 'vitest';
import type { StepMetricsResponse } from '@/lib/api';
import { stepRows } from '@/lib/metrics/steps';

const step = (
  order: number,
  values: Partial<StepMetricsResponse> = {},
): StepMetricsResponse => ({
  stepId: `1c000000-0000-4000-8000-00000000000${order}`,
  order,
  title: `Paso ${order}`,
  reached: 10,
  finished: 10,
  avgDurationMs: 60000,
  abandoned: 0,
  abandonRate: 0,
  ...values,
});

describe('stepRows', () => {
  test('in progress in a step = reached − finished − abandoned', () => {
    const [row] = stepRows([step(1, { reached: 64, finished: 61, abandoned: 2 })]);

    expect(row.inProgress).toBe(1);
  });

  test('the bar is relative to the slowest step, the share to the sum of the times', () => {
    const rows = stepRows([
      step(1, { avgDurationMs: 300000 }),
      step(2, { avgDurationMs: 1440000 }),
      step(3, { avgDurationMs: 2880000 }),
      step(4, { avgDurationMs: 600000 }),
      step(5, { avgDurationMs: 180000 }),
    ]);

    expect(rows.map((row) => row.timeRatio)).toEqual([
      300000 / 2880000,
      0.5,
      1,
      600000 / 2880000,
      180000 / 2880000,
    ]);
    expect(rows.map((row) => Math.round(row.timeShare! * 100))).toEqual([6, 27, 53, 11, 3]);
  });

  test('"Mayor tiempo" marks only the slowest step; on a tie, the first one', () => {
    const rows = stepRows([
      step(1, { avgDurationMs: 60000 }),
      step(2, { avgDurationMs: 420000 }),
      step(3, { avgDurationMs: 420000 }),
    ]);

    expect(rows.map((row) => row.slowest)).toEqual([false, true, false]);
  });

  test('a step without time has no bar, no share and is never the slowest', () => {
    const rows = stepRows([
      step(1, { reached: 0, finished: 0, avgDurationMs: null, abandonRate: null }),
    ]);

    expect(rows[0]).toMatchObject({ timeRatio: 0, timeShare: null, slowest: false, inProgress: 0 });
  });
});
