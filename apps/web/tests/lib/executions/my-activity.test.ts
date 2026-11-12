import { describe, expect, test } from 'vitest';
import type { MyProcedureMetrics } from '@/lib/api';
import {
  RESUME_SECTION_HREF,
  areasByProcedure,
  formatLastActivity,
  staleLabel,
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
