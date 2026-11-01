import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  loadProcedure,
  loadProcedures,
  parseProcedures,
  removeProcedure,
  saveProcedure,
  useStoredProcedures,
} from '@/lib/procedures/session-list';
import { ADMIN_ID, PROCEDURE_ID, STEP_A, stored } from '../../support/procedures';

const OTHER_USER = '0b000000-0000-4000-8000-000000000002';
const OTHER_PROCEDURE = '1a000000-0000-4000-8000-000000000002';

beforeEach(() => {
  window.sessionStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('loadProcedures', () => {
  test('is empty when nothing was saved', () => {
    expect(loadProcedures(ADMIN_ID)).toEqual([]);
  });

  test('returns what was saved', () => {
    saveProcedure(ADMIN_ID, stored());

    expect(loadProcedures(ADMIN_ID)).toEqual([stored()]);
  });

  test('the newest goes first', () => {
    saveProcedure(ADMIN_ID, stored());
    saveProcedure(ADMIN_ID, stored({ id: OTHER_PROCEDURE, title: 'Recepción' }));

    expect(loadProcedures(ADMIN_ID).map((p) => p.id)).toEqual([OTHER_PROCEDURE, PROCEDURE_ID]);
  });

  test('saving a procedure that is already there replaces it, in the same place', () => {
    saveProcedure(ADMIN_ID, stored());
    saveProcedure(ADMIN_ID, stored({ id: OTHER_PROCEDURE }));

    saveProcedure(ADMIN_ID, stored({ title: 'Cierre de caja y arqueo' }));

    const list = loadProcedures(ADMIN_ID);
    expect(list.map((p) => p.id)).toEqual([OTHER_PROCEDURE, PROCEDURE_ID]);
    expect(list[1].title).toBe('Cierre de caja y arqueo');
  });

  test('each user has their own list', () => {
    saveProcedure(ADMIN_ID, stored());

    expect(loadProcedures(OTHER_USER)).toEqual([]);
  });
});

describe('loadProcedure', () => {
  test('finds one by id', () => {
    saveProcedure(ADMIN_ID, stored({ steps: [{ id: STEP_A, order: 1, title: 'A', description: '' }] }));

    expect(loadProcedure(ADMIN_ID, PROCEDURE_ID)?.steps).toHaveLength(1);
  });

  test('is null for an id that was not saved', () => {
    expect(loadProcedure(ADMIN_ID, PROCEDURE_ID)).toBeNull();
  });
});

describe('removeProcedure', () => {
  test('removes only that procedure', () => {
    saveProcedure(ADMIN_ID, stored());
    saveProcedure(ADMIN_ID, stored({ id: OTHER_PROCEDURE }));

    removeProcedure(ADMIN_ID, PROCEDURE_ID);

    expect(loadProcedures(ADMIN_ID).map((p) => p.id)).toEqual([OTHER_PROCEDURE]);
  });

  test('an id that is not there changes nothing', () => {
    saveProcedure(ADMIN_ID, stored());

    removeProcedure(ADMIN_ID, OTHER_PROCEDURE);

    expect(loadProcedures(ADMIN_ID)).toHaveLength(1);
  });
});

describe('parseProcedures', () => {
  test('null is an empty list', () => {
    expect(parseProcedures(null)).toEqual([]);
  });

  test('text that is not JSON is an empty list', () => {
    expect(parseProcedures('{no es json')).toEqual([]);
  });

  test('JSON that is not a list is an empty list', () => {
    expect(parseProcedures('{"id":"x"}')).toEqual([]);
  });

  test('leaves out the entries that do not have the shape of a procedure', () => {
    const raw = JSON.stringify([stored(), { id: 1 }, null, 'texto']);

    expect(parseProcedures(raw)).toEqual([stored()]);
  });
});

describe('when sessionStorage does not work', () => {
  // Private windows or blocked site data: the screens still work for as long as the page lives.
  const FAILING_USER = '0b000000-0000-4000-8000-0000000000ff';

  test('a failing setItem keeps the list in memory', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });

    saveProcedure(FAILING_USER, stored());

    expect(loadProcedures(FAILING_USER)).toEqual([stored()]);
  });

  test('a failing getItem is an empty list, and does not throw', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });

    expect(loadProcedures(OTHER_USER)).toEqual([]);
  });
});

describe('useStoredProcedures', () => {
  test('follows what is saved and removed, in any component', () => {
    const { result } = renderHook(() => useStoredProcedures(ADMIN_ID));
    expect(result.current).toEqual([]);

    act(() => saveProcedure(ADMIN_ID, stored()));
    expect(result.current).toEqual([stored()]);

    act(() => removeProcedure(ADMIN_ID, PROCEDURE_ID));
    expect(result.current).toEqual([]);
  });

  test('without a user it is an empty list', () => {
    saveProcedure(ADMIN_ID, stored());

    const { result } = renderHook(() => useStoredProcedures(null));

    expect(result.current).toEqual([]);
  });

  test('the list is the same object while nothing changes', () => {
    saveProcedure(ADMIN_ID, stored());

    const { result, rerender } = renderHook(() => useStoredProcedures(ADMIN_ID));
    const first = result.current;
    rerender();

    expect(result.current).toBe(first);
  });
});
