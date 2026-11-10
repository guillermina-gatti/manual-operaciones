import { describe, expect, test, vi } from 'vitest';
import type { ApiClient } from '@/lib/api';
import { createProcedureVersionsApi } from '@/lib/api/procedure-versions';
import { PROCEDURE_ID, VERSION_ID } from '../../support/procedures';

const JSON_HEADERS = { 'Content-Type': 'application/json' };
const VERSIONS = `/api/procedures/${PROCEDURE_ID}/versions`;

function fakeClient(result: unknown = undefined) {
  const request = vi.fn().mockResolvedValue(result);
  const client: ApiClient = { request };
  return { api: createProcedureVersionsApi(client), request };
}

describe('listVersions (spec 015, R8)', () => {
  test('gets the page asked for and returns it as it comes', async () => {
    const page = { data: [], total: 0, page: 2, limit: 5 };
    const { api, request } = fakeClient(page);
    const signal = new AbortController().signal;

    const result = await api.listVersions(PROCEDURE_ID, { page: 2, limit: 5 }, signal);

    expect(result).toBe(page);
    expect(request).toHaveBeenCalledWith(`${VERSIONS}?page=2&limit=5`, { signal });
  });

  test('without parameters it does not send a query', async () => {
    const { api, request } = fakeClient();

    await api.listVersions(PROCEDURE_ID);

    expect(request).toHaveBeenCalledWith(VERSIONS, { signal: undefined });
  });
});

describe('getVersion (spec 015, R9)', () => {
  test('gets the version of that procedure', async () => {
    const { api, request } = fakeClient();

    await api.getVersion(PROCEDURE_ID, VERSION_ID);

    expect(request).toHaveBeenCalledWith(`${VERSIONS}/${VERSION_ID}`, { signal: undefined });
  });

  test('encodes the ids that go in the path', async () => {
    const { api, request } = fakeClient();

    await api.getVersion('a/b', 'c d');

    expect(request).toHaveBeenCalledWith('/api/procedures/a%2Fb/versions/c%20d', { signal: undefined });
  });
});

describe('publishVersion (spec 015, R2)', () => {
  test('posts an empty body when there is nothing to say', async () => {
    const { api, request } = fakeClient();

    await api.publishVersion(PROCEDURE_ID, VERSION_ID);

    expect(request).toHaveBeenCalledWith(`${VERSIONS}/${VERSION_ID}/publish`, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: '{}',
      signal: undefined,
    });
  });

  test('posts the critical change and its summary', async () => {
    const { api, request } = fakeClient();

    await api.publishVersion(PROCEDURE_ID, VERSION_ID, { isCritical: true, changeSummary: 'Cambia el límite' });

    expect(request).toHaveBeenCalledWith(`${VERSIONS}/${VERSION_ID}/publish`, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ isCritical: true, changeSummary: 'Cambia el límite' }),
      signal: undefined,
    });
  });
});

describe('createVersionDraft (spec 006, R4)', () => {
  test('posts to the versions of the procedure and returns the new draft', async () => {
    const draft = { id: VERSION_ID, versionNumber: 2 };
    const { api, request } = fakeClient(draft);

    const result = await api.createVersionDraft(PROCEDURE_ID);

    expect(result).toBe(draft);
    expect(request).toHaveBeenCalledWith(VERSIONS, { method: 'POST', signal: undefined });
  });
});
