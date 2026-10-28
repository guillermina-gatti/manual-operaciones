import { describe, expect, test } from 'vitest';
import { formatCount, formatPercent } from '@/lib/metrics/format';

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
