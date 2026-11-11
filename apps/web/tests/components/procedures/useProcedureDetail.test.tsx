import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { useProcedureDetail } from '@/components/procedures/useProcedureDetail';
import { ApiError } from '@/lib/api';
import { PROCEDURE_ID } from '../../support/procedures';
import { procedureDetail } from '../../support/procedure-view';

const mocks = vi.hoisted(() => ({ getProcedure: vi.fn() }));

vi.mock('@/lib/procedures', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/procedures')>()),
  getProcedure: mocks.getProcedure,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getProcedure.mockResolvedValue(procedureDetail());
});

// Spec 006, W1, W6 and W7 (E46, E47): the detail of a procedure, read from the API.
describe('useProcedureDetail', () => {
  test('asks the API for the procedure and gives it', async () => {
    const { result } = renderHook(() => useProcedureDetail(PROCEDURE_ID));

    await waitFor(() => expect(result.current.status).toBe('success'));
    expect(mocks.getProcedure).toHaveBeenCalledWith(PROCEDURE_ID, expect.any(AbortSignal));
    expect(result.current.data?.version.title).toBe('Cierre de caja');
  });

  test('without an id it asks nothing', () => {
    const { result } = renderHook(() => useProcedureDetail(null));

    expect(result.current.status).toBe('idle');
    expect(mocks.getProcedure).not.toHaveBeenCalled();
  });

  test('a 404 is an error of the hook, to be told apart by the screen', async () => {
    mocks.getProcedure.mockRejectedValue(new ApiError(404));

    const { result } = renderHook(() => useProcedureDetail(PROCEDURE_ID));

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toBeInstanceOf(ApiError);
  });

  test('on reload it keeps the last procedure on screen until the new one arrives', async () => {
    const { result } = renderHook(() => useProcedureDetail(PROCEDURE_ID));
    await waitFor(() => expect(result.current.status).toBe('success'));
    mocks.getProcedure.mockReturnValue(new Promise(() => undefined));

    act(() => result.current.reload());

    expect(result.current.status).toBe('success');
    expect(result.current.data?.version.title).toBe('Cierre de caja');
    await waitFor(() => expect(mocks.getProcedure).toHaveBeenCalledTimes(2));
  });
});
