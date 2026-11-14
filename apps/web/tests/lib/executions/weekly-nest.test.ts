import { describe, expect, test } from 'vitest';
import {
  activeDaysCount,
  nestBadge,
  nestDays,
  nestSupportText,
  nestTitle,
  proceduresLabel,
  todayIndex,
  weekRangeLabel,
} from '@/lib/executions/weekly-nest';

describe('weekRangeLabel', () => {
  test('one month: "9 – 13 NOV"', () => {
    expect(weekRangeLabel('2026-11-09', '2026-11-13')).toBe('9 – 13 NOV');
  });

  test('two months: both of them', () => {
    expect(weekRangeLabel('2026-11-30', '2026-12-04')).toBe('30 NOV – 4 DIC');
    expect(weekRangeLabel('2026-12-28', '2027-01-01')).toBe('28 DIC – 1 ENE');
  });

  test('without a date, nothing', () => {
    expect(weekRangeLabel('', '2026-11-13')).toBe('');
  });
});

describe('the words of the nest', () => {
  test('the title for 0, 1 to 4 and 5 days', () => {
    expect(nestTitle(0)).toBe('Tu nido de esta semana está por empezar');
    expect(nestTitle(1)).toBe('1 de 5 días con avance');
    expect(nestTitle(4)).toBe('4 de 5 días con avance');
    expect(nestTitle(5)).toBe('Nido completo');
  });

  test('singular and plural of "procedimiento"', () => {
    expect(proceduresLabel(1)).toBe('1 procedimiento');
    expect(proceduresLabel(0)).toBe('0 procedimientos');
    expect(proceduresLabel(3)).toBe('3 procedimientos');
    expect(proceduresLabel(1200)).toBe('1.200 procedimientos');
  });

  test('the support text', () => {
    expect(nestSupportText(0, 0)).toBe('Completá un procedimiento hoy y sumás la primera franja.');
    expect(nestSupportText(1, 1)).toBe(
      'Completaste 1 procedimiento esta semana. Cada día con avance suma una franja a tu nido.',
    );
    expect(nestSupportText(3, 4)).toBe(
      'Completaste 4 procedimientos esta semana. Cada día con avance suma una franja a tu nido.',
    );
    expect(nestSupportText(5, 9)).toBe('Hiciste avance los 5 días de la semana. Buen trabajo.');
  });

  test('progress (a step) without anything completed never says "0 procedimientos"', () => {
    expect(nestSupportText(2, 0)).toBe(
      'Todavía no completaste procedimientos esta semana. Cada día con avance suma una franja a tu nido.',
    );
  });

  test('completed on the weekend but no working day: the count, not the start text', () => {
    expect(nestSupportText(0, 1)).toContain('Completaste 1 procedimiento');
  });

  test('the badge on the right', () => {
    expect(nestBadge(0)).toBe('start');
    expect(nestBadge(3)).toBe('resets');
    expect(nestBadge(5)).toBe('complete');
  });

  test('the days count once each, at most 5', () => {
    expect(activeDaysCount(['2026-11-09', '2026-11-09', '2026-11-10'])).toBe(2);
    expect(activeDaysCount([])).toBe(0);
  });
});

describe('today and the days', () => {
  test('the index of today from Monday to Friday', () => {
    expect(todayIndex('2026-11-09', '2026-11-09')).toBe(0);
    expect(todayIndex('2026-11-12', '2026-11-09')).toBe(3);
    expect(todayIndex('2026-11-13', '2026-11-09')).toBe(4);
  });

  test('Saturday and Sunday: no mark', () => {
    expect(todayIndex('2026-11-14', '2026-11-09')).toBeNull();
    expect(todayIndex('2026-11-15', '2026-11-09')).toBeNull();
  });

  test('the five days with their words for screen readers', () => {
    const days = nestDays('2026-11-09', ['2026-11-09', '2026-11-11'], '2026-11-12');

    expect(days.map((d) => d.label)).toEqual([
      'Lunes: con avance',
      'Martes: sin avance',
      'Miércoles: con avance',
      'Jueves, hoy: sin avance todavía',
      'Viernes: sin avance',
    ]);
    expect(days.map((d) => d.short)).toEqual(['Lun', 'Mar', 'Mié', 'Jue', 'Vie']);
    expect(days.filter((d) => d.today).map((d) => d.date)).toEqual(['2026-11-12']);
  });

  test('today with progress says so', () => {
    expect(nestDays('2026-11-09', ['2026-11-09'], '2026-11-09')[0].label).toBe(
      'Lunes, hoy: con avance',
    );
  });

  test('across a month the dates keep going', () => {
    expect(nestDays('2026-11-30', [], '2026-12-01').map((d) => d.date)).toEqual([
      '2026-11-30',
      '2026-12-01',
      '2026-12-02',
      '2026-12-03',
      '2026-12-04',
    ]);
  });
});
