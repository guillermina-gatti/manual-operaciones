import { describe, expect, test } from 'vitest';
import { formatCount, formatDay, formatPercent, formatPeriod } from '@/lib/metrics/format';

// A non-breaking space goes before "%", so the number and the sign stay together.
const spaces = (text: string) => text.replace(/\s/g, ' ');

describe('formatPercent', () => {
  test('keeps the number and "%" together with a non-breaking space', () => {
    expect(formatPercent(0.5)).toBe('50 %');
  });

  test.each([
    [0, '0 %'],
    [0.25, '25 %'],
    [1 / 3, '33 %'],
    [1, '100 %'],
  ])('%d → %s', (rate, text) => {
    expect(spaces(formatPercent(rate))).toBe(text);
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
