import { describe, expect, test } from 'vitest';
import { formatLastActivity, staleLabel } from '@/lib/executions/my-activity';

describe('staleLabel', () => {
  test('says how long without progress, never "abandonada"', () => {
    expect(staleLabel(24)).toBe('Sin avanzar hace más de 24 h');
  });
});

describe('formatLastActivity', () => {
  test('the day and the time in Buenos Aires', () => {
    expect(formatLastActivity('2026-10-27T13:05:00.000Z')).toBe('27 oct 2026, 10:05');
  });

  test('after midnight in UTC it is still the day before in Buenos Aires', () => {
    expect(formatLastActivity('2026-10-28T02:30:00.000Z')).toBe('27 oct 2026, 23:30');
  });

  test('something that is not a date', () => {
    expect(formatLastActivity('ayer')).toBe('—');
  });
});
