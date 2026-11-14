import { describe, expect, test } from 'vitest';
import type { MyResumeItem } from '@/lib/api';
import type { ExecutableProcedure } from '@/lib/executions/executable-procedures';
import {
  byLastActivity,
  inProgressByProcedure,
  isPickerSort,
  matchesProcedureSearch,
  moreInProgressLabel,
  proceduresLabel,
  sortProcedures,
  stepsLabel,
  timeSince,
} from '@/lib/executions/picker';

const procedure = (id: string, title: string, stepCount: number): ExecutableProcedure => ({
  id,
  title,
  areas: [],
  stepCount,
  description: null,
});

const resume = (executionId: string, procedureId: string, lastActivityAt: string): MyResumeItem => ({
  executionId,
  procedureId,
  procedureVersionId: 'v',
  currentStep: { stepId: 's', order: 1, title: 'Paso 1' },
  totalSteps: 3,
  startedAt: '2026-11-01T10:00:00.000Z',
  lastActivityAt,
  stale: false,
});

const ALL = [
  procedure('r', 'Recepción de mercadería', 2),
  procedure('a', 'apertura del local', 8),
  procedure('c', 'Cierre de caja', 5),
  procedure('d', 'Devolución', 5),
];
const titles = (list: ExecutableProcedure[]) => list.map((p) => p.title);

describe('matchesProcedureSearch', () => {
  test.each([
    ['recepcion', true],
    ['RECEPCIÓN', true],
    ['  merca ', true],
    ['', true],
    ['caja', false],
  ])('"%s" → %s', (search, expected) => {
    expect(matchesProcedureSearch('Recepción de mercadería', search)).toBe(expected);
  });
});

describe('sortProcedures', () => {
  const none = new Map<string, MyResumeItem>();

  test('A–Z without case', () => {
    expect(titles(sortProcedures(ALL, 'az', none))).toEqual([
      'apertura del local',
      'Cierre de caja',
      'Devolución',
      'Recepción de mercadería',
    ]);
  });

  test('by steps, A–Z on a tie', () => {
    expect(titles(sortProcedures(ALL, 'fewer-steps', none))).toEqual([
      'Recepción de mercadería',
      'Cierre de caja',
      'Devolución',
      'apertura del local',
    ]);
    expect(titles(sortProcedures(ALL, 'more-steps', none))).toEqual([
      'apertura del local',
      'Cierre de caja',
      'Devolución',
      'Recepción de mercadería',
    ]);
  });

  test('in progress first, A–Z inside each group, without changing the given list', () => {
    const inProgress = inProgressByProcedure([
      resume('1', 'r', '2026-11-12T10:00:00.000Z'),
      resume('2', 'd', '2026-11-12T09:00:00.000Z'),
    ]);
    const given = [...ALL];

    expect(titles(sortProcedures(given, 'in-progress', inProgress))).toEqual([
      'Devolución',
      'Recepción de mercadería',
      'apertura del local',
      'Cierre de caja',
    ]);
    expect(given).toEqual(ALL);
  });
});

describe('the executions in progress', () => {
  const OLD = resume('old', 'c', '2026-11-10T10:00:00.000Z');
  const NEW = resume('new', 'c', '2026-11-12T10:00:00.000Z');
  const OTHER = resume('other', 'r', '2026-11-11T10:00:00.000Z');

  test('the most recently moved first, whatever the order they come in', () => {
    expect(byLastActivity([OLD, OTHER, NEW]).map((r) => r.executionId)).toEqual([
      'new',
      'other',
      'old',
    ]);
  });

  test('one per procedure: the one that moved last', () => {
    const map = inProgressByProcedure([OLD, OTHER, NEW]);

    expect(map.get('c')?.executionId).toBe('new');
    expect(map.get('r')?.executionId).toBe('other');
    expect(map.size).toBe(2);
  });
});

describe('timeSince', () => {
  const now = new Date('2026-11-12T12:00:00.000Z');

  test.each([
    ['2026-11-12T11:40:30.000Z', '19 min'],
    ['2026-11-12T11:59:50.000Z', '1 min'],
    ['2026-11-12T09:55:00.000Z', '2 h 5 min'],
    ['2026-11-10T12:00:00.000Z', '48 h'],
    ['no es una fecha', '—'],
  ])('%s → %s', (value, expected) => {
    expect(timeSince(value, now)).toBe(expected);
  });
});

describe('labels', () => {
  test('singular and plural', () => {
    expect([stepsLabel(1), stepsLabel(4)]).toEqual(['1 paso', '4 pasos']);
    expect([proceduresLabel(1), proceduresLabel(0)]).toEqual(['1 procedimiento', '0 procedimientos']);
    expect([moreInProgressLabel(1), moreInProgressLabel(3)]).toEqual([
      'Tenés 1 recorrido más en curso',
      'Tenés 3 recorridos más en curso',
    ]);
  });

  test('isPickerSort only takes the four options', () => {
    expect(['az', 'fewer-steps', 'more-steps', 'in-progress', 'x'].map(isPickerSort)).toEqual([
      true,
      true,
      true,
      true,
      false,
    ]);
  });
});
