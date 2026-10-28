import { describe, expect, test } from 'vitest';
import { formatDuration, formatTime } from '@/lib/executions/format';

describe('formatDuration', () => {
  test.each([
    [0, '0 s'],
    [999, '0 s'],
    [2_221, '2 s'],
    [59_999, '59 s'],
    [60_000, '1 min'],
    [180_000, '3 min'],
    [200_500, '3 min 20 s'],
    [3_600_000, '1 h'],
    [3_900_000, '1 h 5 min'],
    // Seconds are dropped once there are hours.
    [3_905_000, '1 h 5 min'],
  ])('%i ms → "%s"', (ms, text) => {
    expect(formatDuration(ms)).toBe(text);
  });

  test.each([null, -1, Number.NaN])('%s → "—"', (ms) => {
    expect(formatDuration(ms)).toBe('—');
  });
});

describe('formatTime', () => {
  test('shows the hour in the company time zone (Buenos Aires)', () => {
    expect(formatTime('2026-10-27T13:05:00.000Z')).toBe('10:05');
  });

  test('uses 24 hours', () => {
    expect(formatTime('2026-10-27T20:30:00.000Z')).toBe('17:30');
  });

  test('an invalid date → "—"', () => {
    expect(formatTime('not a date')).toBe('—');
  });
});
