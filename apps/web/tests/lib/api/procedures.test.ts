import { describe, expect, test, vi } from 'vitest';
import type { ApiClient } from '@/lib/api';
import { createProceduresApi } from '@/lib/api/procedures';
import {
  PROCEDURE_ID,
  STEP_A,
  STEP_B,
  VENTAS,
  VERSION_ID,
  procedureResponse,
} from '../../support/procedures';

const JSON_HEADERS = { 'Content-Type': 'application/json' };
const PROCEDURE = `/api/procedures/${PROCEDURE_ID}`;
const VERSION = `${PROCEDURE}/versions/${VERSION_ID}`;

function fakeClient(result: unknown = undefined) {
  const request = vi.fn().mockResolvedValue(result);
  const client: ApiClient = { request };
  return { api: createProceduresApi(client), request };
}

describe('createProcedure', () => {
  test('posts the title and description as JSON and returns the procedure', async () => {
    const created = procedureResponse();
    const { api, request } = fakeClient(created);
    const signal = new AbortController().signal;

    const result = await api.createProcedure({ title: 'Cierre de caja', description: 'Al final del día' }, signal);

    expect(result).toBe(created);
    expect(request).toHaveBeenCalledWith('/api/procedures', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ title: 'Cierre de caja', description: 'Al final del día' }),
      signal,
    });
  });
});

describe('updateVersion', () => {
  test('patches only the fields it receives', async () => {
    const { api, request } = fakeClient();

    await api.updateVersion(PROCEDURE_ID, VERSION_ID, { title: 'Cierre' });

    expect(request).toHaveBeenCalledWith(VERSION, {
      method: 'PATCH',
      headers: JSON_HEADERS,
      body: JSON.stringify({ title: 'Cierre' }),
      signal: undefined,
    });
  });

  test('encodes the ids so they cannot change the path', async () => {
    const { api, request } = fakeClient();

    await api.updateVersion('../documents', 'a/b', { title: 'X' });

    expect(request).toHaveBeenCalledWith(
      '/api/procedures/..%2Fdocuments/versions/a%2Fb',
      expect.objectContaining({ method: 'PATCH' }),
    );
  });
});

describe('discardDraft', () => {
  test('deletes the version, without a body', async () => {
    const { api, request } = fakeClient();

    await api.discardDraft(PROCEDURE_ID, VERSION_ID);

    expect(request).toHaveBeenCalledWith(VERSION, { method: 'DELETE', signal: undefined });
  });
});

describe('steps', () => {
  test('addStep posts the step to the steps of the version', async () => {
    const { api, request } = fakeClient();

    await api.addStep(PROCEDURE_ID, VERSION_ID, { title: 'Contar el efectivo', description: 'Billetes' });

    expect(request).toHaveBeenCalledWith(`${VERSION}/steps`, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ title: 'Contar el efectivo', description: 'Billetes' }),
      signal: undefined,
    });
  });

  test('updateStep patches that step', async () => {
    const { api, request } = fakeClient();

    await api.updateStep(PROCEDURE_ID, VERSION_ID, STEP_A, { title: 'Contar' });

    expect(request).toHaveBeenCalledWith(`${VERSION}/steps/${STEP_A}`, {
      method: 'PATCH',
      headers: JSON_HEADERS,
      body: JSON.stringify({ title: 'Contar' }),
      signal: undefined,
    });
  });

  test('deleteStep deletes that step, without a body', async () => {
    const { api, request } = fakeClient();

    await api.deleteStep(PROCEDURE_ID, VERSION_ID, STEP_A);

    expect(request).toHaveBeenCalledWith(`${VERSION}/steps/${STEP_A}`, {
      method: 'DELETE',
      signal: undefined,
    });
  });

  test('reorderSteps puts the whole list of ids in the new order', async () => {
    const { api, request } = fakeClient();

    await api.reorderSteps(PROCEDURE_ID, VERSION_ID, [STEP_B, STEP_A]);

    expect(request).toHaveBeenCalledWith(`${VERSION}/steps/order`, {
      method: 'PUT',
      headers: JSON_HEADERS,
      body: JSON.stringify({ stepIds: [STEP_B, STEP_A] }),
      signal: undefined,
    });
  });
});

describe('setAreas', () => {
  test('puts the whole set of areas of the procedure', async () => {
    const { api, request } = fakeClient({ areaIds: [VENTAS] });

    const result = await api.setAreas(PROCEDURE_ID, [VENTAS]);

    expect(result).toEqual({ areaIds: [VENTAS] });
    expect(request).toHaveBeenCalledWith(`${PROCEDURE}/areas`, {
      method: 'PUT',
      headers: JSON_HEADERS,
      body: JSON.stringify({ areaIds: [VENTAS] }),
      signal: undefined,
    });
  });

  test('an empty set is sent as it is', async () => {
    const { api, request } = fakeClient({ areaIds: [] });

    await api.setAreas(PROCEDURE_ID, []);

    expect(request).toHaveBeenCalledWith(
      `${PROCEDURE}/areas`,
      expect.objectContaining({ body: JSON.stringify({ areaIds: [] }) }),
    );
  });
});
