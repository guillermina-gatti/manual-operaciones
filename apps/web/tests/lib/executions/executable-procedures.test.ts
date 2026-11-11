import { describe, expect, test } from 'vitest';
import { ApiError } from '@/lib/api';
import {
  describeListError,
  executableProcedures,
} from '@/lib/executions/executable-procedures';
import type { ProcedureListItem } from '@/lib/procedures';

const VENTAS = { id: '0a000000-0000-4000-8000-000000000001', name: 'Ventas', isActive: true };

const item = (
  id: string,
  version: Partial<ProcedureListItem['version']> = {},
): ProcedureListItem => ({
  id,
  createdAt: '2026-11-01T10:00:00.000Z',
  version: {
    id: `v-${id}`,
    versionNumber: 2,
    status: 'PUBLISHED',
    title: `Procedimiento ${id}`,
    description: null,
    stepCount: 4,
    ...version,
  },
  areas: [VENTAS],
});

describe('executableProcedures', () => {
  test('a published version with steps: its id, the title of the version and the areas', () => {
    expect(executableProcedures([item('a')])).toEqual([
      { id: 'a', title: 'Procedimiento a', areas: [VENTAS] },
    ]);
  });

  test('leaves out a draft and a version without steps, keeping the order', () => {
    const items = [
      item('a'),
      item('b', { status: 'DRAFT' }),
      item('c', { stepCount: 0 }),
      item('d', { status: 'SUPERSEDED' }),
      item('e'),
    ];

    expect(executableProcedures(items).map((p) => p.id)).toEqual(['a', 'e']);
  });

  test('nothing listed: nothing to execute', () => {
    expect(executableProcedures([])).toEqual([]);
  });
});

describe('describeListError', () => {
  test.each([
    [new ApiError(0), 'No pudimos conectarnos', true],
    [new ApiError(401), 'Tu sesión no es válida. Volvé a ingresar.', false],
    [new ApiError(503), 'El servicio no está disponible. Probá de nuevo en unos minutos.', true],
    [new ApiError(500), 'Ocurrió un error inesperado. Probá de nuevo.', true],
    [new Error('boom'), 'Ocurrió un error inesperado. Probá de nuevo.', true],
  ])('%s → its message', (error, message, canRetry) => {
    const description = describeListError(error);

    expect(description.message).toContain(message);
    expect(description.canRetry).toBe(canRetry);
  });

  test('never the text of the API', () => {
    expect(describeListError(new ApiError(503, ['texto interno'])).message).not.toContain(
      'texto interno',
    );
  });
});
