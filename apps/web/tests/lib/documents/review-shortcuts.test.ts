import { describe, expect, test } from 'vitest';
import {
  addMonths,
  formatLongDate,
  shortcutDate,
  shortcutFor,
  todayIn,
} from '@/lib/documents/review-shortcuts';

describe('todayIn (Buenos Aires)', () => {
  test('a las 23:59 de Buenos Aires todavía es ese día, aunque en UTC ya sea el siguiente', () => {
    expect(todayIn(new Date('2026-11-07T02:59:00.000Z'))).toBe('2026-11-06');
    expect(todayIn(new Date('2026-11-07T03:00:00.000Z'))).toBe('2026-11-07');
  });
});

describe('addMonths', () => {
  test.each([
    ['2026-11-06', 3, '2027-02-06'],
    ['2026-11-06', 6, '2027-05-06'],
    ['2026-11-06', 12, '2027-11-06'],
    // El día no existe en el mes de destino: el último del mes.
    ['2026-11-30', 3, '2027-02-28'],
    ['2027-11-29', 3, '2028-02-29'],
    ['2026-08-31', 6, '2027-02-28'],
    ['2028-02-29', 12, '2029-02-28'],
  ])('%s + %i meses → %s', (day, months, expected) => {
    expect(addMonths(day, months)).toBe(expected);
  });
});

describe('atajos', () => {
  const NOW = new Date('2026-11-06T15:00:00.000Z');

  test('cada atajo es hoy en Buenos Aires + N meses', () => {
    expect(shortcutDate(3, NOW)).toBe('2027-02-06');
    expect(shortcutDate(6, NOW)).toBe('2027-05-06');
    expect(shortcutDate(12, NOW)).toBe('2027-11-06');
  });

  test('reconoce el atajo de una fecha; otra fecha o vacía, null', () => {
    expect(shortcutFor('2027-05-06', NOW)).toBe(6);
    expect(shortcutFor('2027-05-07', NOW)).toBeNull();
    expect(shortcutFor('', NOW)).toBeNull();
  });
});

describe('formatLongDate', () => {
  test('la fecha en palabras, sin correrse un día', () => {
    expect(formatLongDate('2027-05-06')).toBe('6 de mayo de 2027');
    expect(formatLongDate('2027-01-01')).toBe('1 de enero de 2027');
  });

  test('una fecha que no existe o mal escrita da null', () => {
    expect(formatLongDate('2027-02-30')).toBeNull();
    expect(formatLongDate('')).toBeNull();
    expect(formatLongDate('06/05/2027')).toBeNull();
  });
});
