import { describe, expect, test } from 'vitest';
import { formatRelative } from '@/lib/documents/relative-time';

const NOW = new Date('2026-11-06T12:00:00.000Z');
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe('formatRelative', () => {
  test.each([
    [ago(10 * 1000), 'recién'],
    [ago(5 * MINUTE), 'hace 5 minutos'],
    [ago(2 * HOUR), 'hace 2 horas'],
    [ago(DAY), 'ayer'],
    [ago(3 * DAY), 'hace 3 días'],
    [ago(14 * DAY), 'hace 2 semanas'],
    [ago(60 * DAY), 'hace 2 meses'],
    [ago(400 * DAY), 'el año pasado'],
  ])('%s → %s', (value, expected) => {
    expect(formatRelative(value, NOW)).toBe(expected);
  });

  test('una fecha apenas en el futuro cuenta como "recién"', () => {
    expect(formatRelative(new Date(NOW.getTime() + 30 * 1000).toISOString(), NOW)).toBe('recién');
  });

  test('una fecha ilegible devuelve null', () => {
    expect(formatRelative('no es una fecha', NOW)).toBeNull();
  });

  test('el mismo "ahora" da siempre el mismo texto', () => {
    const value = ago(3 * DAY);
    expect(formatRelative(value, NOW)).toBe(formatRelative(value, new Date(NOW)));
  });
});
