import { describe, expect, test } from 'vitest';
import { averageCompletionMs, outcomeShares } from '@/lib/metrics/summary';

describe('averageCompletionMs', () => {
  test('weights each procedure by its completed executions', () => {
    // (12 min × 2 + 5 min × 1) ÷ 3 = 9 min 40 s.
    expect(
      averageCompletionMs([
        { completed: 2, avgCompletionMs: 720000 },
        { completed: 1, avgCompletionMs: 300000 },
      ]),
    ).toBe(580000);
  });

  test('a procedure without completed executions does not count', () => {
    expect(
      averageCompletionMs([
        { completed: 0, avgCompletionMs: null },
        { completed: 4, avgCompletionMs: 60000 },
      ]),
    ).toBe(60000);
  });

  test('without completed executions there is no average', () => {
    expect(averageCompletionMs([])).toBeNull();
    expect(averageCompletionMs([{ completed: 0, avgCompletionMs: null }])).toBeNull();
  });
});

describe('outcomeShares', () => {
  test('each outcome over the executions', () => {
    expect(outcomeShares({ started: 4, completed: 2, inProgress: 1, abandoned: 1 })).toEqual({
      completed: 0.5,
      inProgress: 0.25,
      abandoned: 0.25,
    });
  });

  test('without executions, nothing to divide', () => {
    expect(outcomeShares({ started: 0, completed: 0, inProgress: 0, abandoned: 0 })).toEqual({
      completed: null,
      inProgress: null,
      abandoned: null,
    });
  });
});
