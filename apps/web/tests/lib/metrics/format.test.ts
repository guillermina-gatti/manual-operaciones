import { describe, expect, test } from 'vitest';
import {
  formatCount,
  formatDay,
  formatLatency,
  formatPercent,
  formatPeriod,
  formatShare,
} from '@/lib/metrics/format';

describe('formatPercent', () => {
  test.each([
    [0, '0,0%'],
    [0.25, '25,0%'],
    [0.793, '79,3%'],
    [1 / 3, '33,3%'],
    [0.0005, '0,1%'],
    [1, '100,0%'],
  ])('%d → %s', (rate, text) => {
    expect(formatPercent(rate)).toBe(text);
  });

  test('null (nothing to divide) → "—"', () => {
    expect(formatPercent(null)).toBe('—');
    expect(formatPercent(Number.NaN)).toBe('—');
  });
});

describe('formatCount', () => {
  test('groups thousands with a dot', () => {
    expect(formatCount(1284)).toBe('1.284');
    expect(formatCount(7)).toBe('7');
  });
});

describe('formatLatency', () => {
  test.each([
    [850, '850 ms'],
    [0, '0 ms'],
    [999.4, '999 ms'],
    [999.6, '1,0 s'],
    [2400, '2,4 s'],
    [61000, '61,0 s'],
  ])('%s → %s', (ms, text) => {
    expect(formatLatency(ms)).toBe(text);
  });

  test('nothing timed or a value that is not a time: "—"', () => {
    expect(formatLatency(null)).toBe('—');
    expect(formatLatency(Number.NaN)).toBe('—');
    expect(formatLatency(-1)).toBe('—');
  });
});

describe('formatDay', () => {
  test.each([
    ['2026-11-04', '4 nov 2026'],
    ['2026-01-31', '31 ene 2026'],
    ['2026-12-01', '1 dic 2026'],
  ])('%s → %s', (day, text) => {
    expect(formatDay(day)).toBe(text);
  });

  test('something that is not a day → "—"', () => {
    expect(formatDay('2026-13-01')).toBe('—');
    expect(formatDay('04/11/2026')).toBe('—');
  });
});

describe('formatPeriod', () => {
  test('two days joined by a dash', () => {
    expect(formatPeriod('2026-11-01', '2026-11-04')).toBe('1 nov 2026 – 4 nov 2026');
  });

  test('the same day only once', () => {
    expect(formatPeriod('2026-11-04', '2026-11-04')).toBe('4 nov 2026');
  });
});

describe('formatShare', () => {
  test.each([
    [0.567, '57%'],
    [0.5, '50%'],
    [0, '0%'],
    [1, '100%'],
  ])('%d → %s, a whole percentage', (share, text) => {
    expect(formatShare(share)).toBe(text);
  });

  test('null → "—"', () => {
    expect(formatShare(null)).toBe('—');
  });
});
