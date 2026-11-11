import { describe, expect, test, vi } from 'vitest';
import type { ApiClient } from '@/lib/api';
import { createProcedureViewApi } from '@/lib/api/procedure-view';
import { PROCEDURE_ID } from '../../support/procedures';

function fakeClient(result: unknown = undefined) {
  const request = vi.fn().mockResolvedValue(result);
  const client: ApiClient = { request };
  return { api: createProcedureViewApi(client), request };
}

describe('listProcedures (spec 006, R16)', () => {
  test('gets the page asked for and returns it as it comes', async () => {
    const page = { data: [], total: 0, page: 2, limit: 20 };
    const { api, request } = fakeClient(page);
    const signal = new AbortController().signal;

    const result = await api.listProcedures({ page: 2, limit: 20 }, signal);

    expect(result).toBe(page);
    expect(request).toHaveBeenCalledWith('/api/procedures?page=2&limit=20', { signal });
  });

  test('without parameters it does not send a query', async () => {
    const { api, request } = fakeClient();

    await api.listProcedures();

    expect(request).toHaveBeenCalledWith('/api/procedures', { signal: undefined });
  });
});

describe('getProcedure (spec 006, R13)', () => {
  test('gets the procedure by its id', async () => {
    const { api, request } = fakeClient();

    await api.getProcedure(PROCEDURE_ID);

    expect(request).toHaveBeenCalledWith(`/api/procedures/${PROCEDURE_ID}`, { signal: undefined });
  });

  test('encodes the id that goes in the path', async () => {
    const { api, request } = fakeClient();

    await api.getProcedure('a/b');

    expect(request).toHaveBeenCalledWith('/api/procedures/a%2Fb', { signal: undefined });
  });
});
