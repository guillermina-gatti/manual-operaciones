import { describe, expect, test } from 'vitest';
import {
  addDays,
  addMonths,
  areaOptions,
  defaultPeriod,
  isCalendarDate,
  matchingQuickPeriod,
  metricsHref,
  parseMetricsFilters,
  quickPeriodRange,
  todayInCompany,
} from '@/lib/metrics/filters';

const VENTAS = '0a000000-0000-4000-8000-000000000001';
const OPERACIONES = '0a000000-0000-4000-8000-000000000002';
const AREAS = [
  { id: VENTAS, name: 'Ventas', isActive: true },
  { id: OPERACIONES, name: 'Operaciones', isActive: true },
];
const params = (query: string) => new URLSearchParams(query);

describe('todayInCompany', () => {
  test('is the day in Buenos Aires, not in UTC', () => {
    // 01:30 UTC on the 28th is still 22:30 of the 27th in Buenos Aires.
    expect(todayInCompany(new Date('2026-10-28T01:30:00.000Z'))).toBe('2026-10-27');
    expect(todayInCompany(new Date('2026-10-28T03:00:00.000Z'))).toBe('2026-10-28');
  });
});

describe('addDays and defaultPeriod', () => {
  test('cross months and years', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  test('the default period is this month, today included', () => {
    expect(defaultPeriod('2026-10-27')).toEqual({ from: '2026-10-01', to: '2026-10-27' });
    expect(defaultPeriod('2026-11-01')).toEqual({ from: '2026-11-01', to: '2026-11-01' });
  });
});

describe('addMonths', () => {
  test('goes to the same day of another month, across years', () => {
    expect(addMonths('2026-11-04', -3)).toBe('2026-08-04');
    expect(addMonths('2026-02-15', -3)).toBe('2025-11-15');
  });

  test('a day the month does not have becomes its last one', () => {
    expect(addMonths('2026-05-31', -3)).toBe('2026-02-28');
    expect(addMonths('2024-05-31', -3)).toBe('2024-02-29');
  });
});

describe('quick periods', () => {
  test.each([
    ['today', { from: '2026-11-04', to: '2026-11-04' }],
    ['month', { from: '2026-11-01', to: '2026-11-04' }],
    ['quarter', { from: '2026-08-04', to: '2026-11-04' }],
  ] as const)('%s ends today', (period, range) => {
    expect(quickPeriodRange(period, '2026-11-04')).toEqual(range);
  });

  test('the dates of a quick period mark it', () => {
    expect(matchingQuickPeriod('2026-11-04', '2026-11-04', '2026-11-04')).toBe('today');
    expect(matchingQuickPeriod('2026-11-01', '2026-11-04', '2026-11-04')).toBe('month');
    expect(matchingQuickPeriod('2026-08-04', '2026-11-04', '2026-11-04')).toBe('quarter');
  });

  test('dates changed by hand mark none', () => {
    expect(matchingQuickPeriod('2026-11-02', '2026-11-04', '2026-11-04')).toBeNull();
    expect(matchingQuickPeriod('2026-11-01', '2026-11-03', '2026-11-04')).toBeNull();
  });

  test('on the 1st, "Este mes" wins over "Hoy"', () => {
    expect(matchingQuickPeriod('2026-11-01', '2026-11-01', '2026-11-01')).toBe('month');
  });
});

describe('isCalendarDate', () => {
  test.each(['2026-10-27', '2024-02-29'])('accepts %s', (text) => {
    expect(isCalendarDate(text)).toBe(true);
  });

  test.each(['2026-02-30', '27/10/2026', '2026-10-27T00:00', ''])('rejects %s', (text) => {
    expect(isCalendarDate(text)).toBe(false);
  });
});

describe('parseMetricsFilters', () => {
  test('without parameters: no area and this month', () => {
    expect(parseMetricsFilters(params(''), '2026-10-27')).toEqual({
      areaId: null,
      from: '2026-10-01',
      to: '2026-10-27',
    });
  });

  test('reads area, desde and hasta from the address', () => {
    expect(
      parseMetricsFilters(params(`area=${VENTAS}&desde=2026-10-01&hasta=2026-10-15`), '2026-10-27'),
    ).toEqual({ areaId: VENTAS, from: '2026-10-01', to: '2026-10-15' });
  });

  test('ignores values written by hand that are not valid', () => {
    expect(
      parseMetricsFilters(params('area=ventas&desde=2026-02-30&hasta=ayer'), '2026-10-27'),
    ).toEqual({ areaId: null, from: '2026-10-01', to: '2026-10-27' });
  });
});

describe('metricsHref', () => {
  test('builds the address with the filters', () => {
    expect(metricsHref({ areaId: VENTAS, from: '2026-10-01', to: '2026-10-27' })).toBe(
      `/metricas?area=${VENTAS}&desde=2026-10-01&hasta=2026-10-27`,
    );
  });

  test('without an area, leaves it out', () => {
    expect(metricsHref({ areaId: null, from: '2026-10-01', to: '2026-10-27' })).toBe(
      '/metricas?desde=2026-10-01&hasta=2026-10-27',
    );
  });
});

describe('areaOptions', () => {
  test('ADMIN: "Todas" and every area', () => {
    expect(areaOptions(true, AREAS, null, null)).toEqual([
      { value: '', label: 'Todas' },
      { value: VENTAS, label: 'Ventas' },
      { value: OPERACIONES, label: 'Operaciones' },
    ]);
  });

  test('SUPERVISOR: "Todas mis áreas" and only theirs', () => {
    expect(areaOptions(false, AREAS, [VENTAS], null)).toEqual([
      { value: '', label: 'Todas mis áreas' },
      { value: VENTAS, label: 'Ventas' },
    ]);
  });

  test('SUPERVISOR while the answer loads: only the selected area', () => {
    expect(areaOptions(false, AREAS, undefined, VENTAS)).toEqual([
      { value: '', label: 'Todas mis áreas' },
      { value: VENTAS, label: 'Ventas' },
    ]);
    expect(areaOptions(false, AREAS, undefined, null)).toEqual([
      { value: '', label: 'Todas mis áreas' },
    ]);
  });

  test('an inactive area is labeled "(inactiva)"', () => {
    const areas = [AREAS[0], { ...AREAS[1], isActive: false }];

    expect(areaOptions(true, areas, null, null)).toEqual([
      { value: '', label: 'Todas' },
      { value: VENTAS, label: 'Ventas' },
      { value: OPERACIONES, label: 'Operaciones (inactiva)' },
    ]);
    expect(areaOptions(false, areas, [VENTAS], OPERACIONES).at(-1)).toEqual({
      value: OPERACIONES,
      label: 'Operaciones (inactiva)',
    });
  });

  test('a selected area without a known name stays in the list', () => {
    const unknown = '0a000000-0000-4000-8000-000000000099';

    expect(areaOptions(true, AREAS, null, unknown).at(-1)).toEqual({
      value: unknown,
      label: 'Área elegida',
    });
  });
});
