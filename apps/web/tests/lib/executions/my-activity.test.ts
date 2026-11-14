import { describe, expect, test } from 'vitest';
import type { MyProcedureMetrics } from '@/lib/api';
import {
  RESUME_SECTION_HREF,
  areasByProcedure,
  completedLabel,
  completedPercentLabel,
  durationParts,
  formatLastActivity,
  formatShortPeriod,
  inProgressLabel,
  lastActivityParts,
  shareOf,
  staleCountLabel,
  staleLabel,
  summaryHeadline,
} from '@/lib/executions/my-activity';

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

describe('RESUME_SECTION_HREF', () => {
  test('the "Para retomar" section of Mi actividad', () => {
    expect(RESUME_SECTION_HREF).toBe('/ejecuciones/mi-actividad#para-retomar');
  });
});

describe('areasByProcedure', () => {
  const procedure = (procedureId: string, areaIds: string[]) =>
    ({ procedureId, areaIds }) as MyProcedureMetrics;
  const AREAS = [
    { id: 'v', name: 'Ventas', isActive: true },
    { id: 'o', name: 'Operaciones', isActive: false },
  ];

  test('the names of the directory, in the order of the procedure, keeping "inactive"', () => {
    const map = areasByProcedure([procedure('p1', ['o', 'v'])], AREAS);

    expect(map.get('p1')).toEqual([
      { id: 'o', name: 'Operaciones', isActive: false },
      { id: 'v', name: 'Ventas', isActive: true },
    ]);
  });

  test('an unknown area is left out; a procedure without known areas is not there', () => {
    const map = areasByProcedure(
      [procedure('p1', ['v', 'x']), procedure('p2', ['x'])],
      AREAS,
    );

    expect(map.get('p1')).toEqual([{ id: 'v', name: 'Ventas', isActive: true }]);
    expect(map.has('p2')).toBe(false);
  });
});

describe('lastActivityParts', () => {
  test('the day and the time apart, in Buenos Aires', () => {
    expect(lastActivityParts('2026-10-27T13:05:00.000Z')).toEqual({ day: '27 oct 2026', time: '10:05' });
  });

  test('something that is not a date → null', () => {
    expect(lastActivityParts('nope')).toBeNull();
  });
});

describe('formatShortPeriod', () => {
  test('in the same year, without it', () => {
    expect(formatShortPeriod('2026-11-01', '2026-11-13')).toBe('1 nov – 13 nov');
  });

  test('across years, with them', () => {
    expect(formatShortPeriod('2026-12-20', '2027-01-05')).toBe('20 dic 2026 – 5 ene 2027');
  });

  test('a single day', () => {
    expect(formatShortPeriod('2026-11-13', '2026-11-13')).toBe('13 nov');
  });
});

describe('summaryHeadline', () => {
  test('plural', () => {
    expect(summaryHeadline(25, 27)).toBe('Terminaste 25 de los 27 recorridos que empezaste');
  });

  test('singular', () => {
    expect(summaryHeadline(1, 1)).toBe('Terminaste 1 de 1 recorrido que empezaste');
  });

  test('thousands with a dot', () => {
    expect(summaryHeadline(1200, 1284)).toBe(
      'Terminaste 1.200 de los 1.284 recorridos que empezaste',
    );
  });
});

describe('completedPercentLabel', () => {
  test('completed of started, with one decimal and a space before %', () => {
    expect(completedPercentLabel(25 / 27)).toBe('92,6 %');
    expect(completedPercentLabel(1)).toBe('100,0 %');
  });

  test('nothing started → a dash', () => {
    expect(completedPercentLabel(null)).toBe('—');
  });
});

describe('the legend', () => {
  test('singular and plural', () => {
    expect(completedLabel(1)).toBe('1 completada');
    expect(completedLabel(0)).toBe('0 completadas');
    expect(completedLabel(25)).toBe('25 completadas');
    expect(inProgressLabel(2)).toBe('2 en curso');
    expect(staleCountLabel(1)).toBe('1 sin avanzar');
  });
});

describe('shareOf', () => {
  test('a part of the total, in %', () => {
    expect(shareOf(11, 12)).toBeCloseTo(91.667, 2);
    expect(shareOf(0, 5)).toBe(0);
  });

  test('without a total, 0; never more than 100', () => {
    expect(shareOf(3, 0)).toBe(0);
    expect(shareOf(6, 5)).toBe(100);
  });
});

describe('durationParts', () => {
  test('each number with its unit', () => {
    expect(durationParts('21 min 30 s')).toEqual([
      { value: '21', unit: 'min' },
      { value: '30', unit: 's' },
    ]);
    expect(durationParts('2 h')).toEqual([{ value: '2', unit: 'h' }]);
  });

  test('a dash has no parts', () => {
    expect(durationParts('—')).toEqual([]);
  });
});
