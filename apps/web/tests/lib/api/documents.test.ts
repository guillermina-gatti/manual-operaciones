import { describe, expect, test, vi } from 'vitest';
import type { ApiClient } from '@/lib/api';
import { createDocumentsApi, PAGE_SIZE } from '@/lib/api/documents';
import type {
  DocumentResponse,
  DocumentSearchResponse,
  UploadDocumentValues,
} from '@/lib/api/documents';

const ID = '11111111-1111-4111-8111-111111111111';

// Respuesta con la forma del backend (plan 001, 3.1): si un tipo de la web no coincide, no compila.
const DOCUMENT: DocumentResponse = {
  id: ID,
  title: 'Manual de caja',
  description: null,
  status: 'ACTIVE',
  areaIds: ['0a000000-0000-4000-8000-000000000001'],
  ownerId: '0b000000-0000-4000-8000-000000000002',
  reviewDate: '2027-03-01',
  createdById: '0b000000-0000-4000-8000-000000000001',
  createdAt: '2026-10-23T15:00:00.000Z',
  currentVersion: {
    id: '22222222-2222-4222-8222-222222222222',
    versionNumber: 1,
    status: 'CURRENT',
    originalFileName: 'manual.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 2097152,
    processingStatus: 'PENDING',
    createdAt: '2026-10-23T15:00:00.000Z',
  },
};

function fakeClient(response: unknown = DOCUMENT) {
  const request = vi.fn().mockResolvedValue(response);
  const client: ApiClient = { request };
  return { api: createDocumentsApi(client), request };
}

const VALUES: UploadDocumentValues = {
  file: new File(['%PDF-1.7'], 'manual.pdf', { type: 'application/pdf' }),
  title: 'Manual de caja',
  areaIds: ['0a000000-0000-4000-8000-000000000001', '0a000000-0000-4000-8000-000000000002'],
  ownerId: '0b000000-0000-4000-8000-000000000002',
  reviewDate: '2027-03-01',
  description: '',
};

describe('listDocuments (F7)', () => {
  test('pide la página con 20 documentos por página', async () => {
    const { api, request } = fakeClient({ data: [], total: 0, page: 2, limit: 20 });

    await api.listDocuments(2);

    expect(PAGE_SIZE).toBe(20);
    expect(request).toHaveBeenCalledWith('/api/documents?page=2&limit=20', { signal: undefined });
  });
});

describe('getDocument y getDownloadUrl', () => {
  test('getDocument arma la URL con el id y devuelve el detalle', async () => {
    const { api, request } = fakeClient();

    await expect(api.getDocument(ID)).resolves.toEqual(DOCUMENT);
    expect(request).toHaveBeenCalledWith(`/api/documents/${ID}`, { signal: undefined });
  });

  test('getDownloadUrl arma la URL con el id (F8)', async () => {
    const { api, request } = fakeClient({ url: 'https://…', expiresAt: '2026-10-23T15:05:00.000Z' });

    await api.getDownloadUrl(ID);

    expect(request).toHaveBeenCalledWith(`/api/documents/${ID}/download`, { signal: undefined });
  });

  test('un id raro se codifica y nunca sale de /api/documents/', async () => {
    const { api, request } = fakeClient();

    await api.getDocument('../users?x=1');

    expect(request).toHaveBeenCalledWith('/api/documents/..%2Fusers%3Fx%3D1', {
      signal: undefined,
    });
  });

  test('pasa la señal de cancelación al cliente', async () => {
    const { api, request } = fakeClient();
    const controller = new AbortController();

    await api.getDocument(ID, controller.signal);

    expect(request).toHaveBeenCalledWith(`/api/documents/${ID}`, {
      signal: controller.signal,
    });
  });
});

describe('uploadDocument', () => {
  async function sentForm(values: UploadDocumentValues) {
    const { api, request } = fakeClient();
    await api.uploadDocument(values);
    const [path, init] = request.mock.calls[0];
    return { path, init, form: init.body as FormData };
  }

  test('hace POST a /api/documents con FormData', async () => {
    const { path, init, form } = await sentForm(VALUES);

    expect(path).toBe('/api/documents');
    expect(init.method).toBe('POST');
    expect(form).toBeInstanceOf(FormData);
  });

  test('manda el archivo, el título, el responsable y la fecha', async () => {
    const { form } = await sentForm(VALUES);

    expect(form.get('file')).toBe(VALUES.file);
    expect(form.get('title')).toBe('Manual de caja');
    expect(form.get('ownerId')).toBe(VALUES.ownerId);
    expect(form.get('reviewDate')).toBe('2027-03-01');
  });

  test('repite areaIds una vez por área', async () => {
    const { form } = await sentForm(VALUES);

    expect(form.getAll('areaIds')).toEqual(VALUES.areaIds);
  });

  test('sin descripción, o con solo espacios, no manda description', async () => {
    expect((await sentForm(VALUES)).form.has('description')).toBe(false);
    expect((await sentForm({ ...VALUES, description: '   ' })).form.has('description')).toBe(false);
  });

  test('con descripción, la manda', async () => {
    const { form } = await sentForm({ ...VALUES, description: 'Procedimiento de cierre' });

    expect(form.get('description')).toBe('Procedimiento de cierre');
  });

  test('no manda campos de más', async () => {
    const { form } = await sentForm({ ...VALUES, description: 'Algo' });

    expect([...new Set(form.keys())].sort()).toEqual(
      ['areaIds', 'description', 'file', 'ownerId', 'reviewDate', 'title'],
    );
  });
});

// Spec 003: las llamadas del ciclo de vida (plan 003, 6.6).
describe('ciclo de vida (spec 003)', () => {
  const VERSION_ID = '33333333-3333-4333-8333-333333333333';
  const AREA = '0a000000-0000-4000-8000-000000000002';
  const OWNER = '0b000000-0000-4000-8000-000000000004';

  // Un archivado, con la forma del backend: archivedAt en texto ISO.
  const ARCHIVED: DocumentResponse = {
    ...DOCUMENT,
    status: 'ARCHIVED',
    archivedAt: '2026-10-23T18:00:00.000Z',
  };

  test('changeAreas hace PATCH a /areas con JSON, sin ownerId si no vino', async () => {
    const { api, request } = fakeClient();

    await api.changeAreas(ID, { areaIds: [AREA] });

    const [path, init] = request.mock.calls[0];
    expect(path).toBe(`/api/documents/${ID}/areas`);
    expect(init.method).toBe('PATCH');
    expect(new Headers(init.headers).get('Content-Type')).toBe('application/json');
    expect(JSON.parse(init.body as string)).toEqual({ areaIds: [AREA] });
  });

  test('changeAreas manda ownerId cuando viene', async () => {
    const { api, request } = fakeClient();

    await api.changeAreas(ID, { areaIds: [AREA], ownerId: OWNER });

    expect(JSON.parse(request.mock.calls[0][1].body as string)).toEqual({
      areaIds: [AREA],
      ownerId: OWNER,
    });
  });

  test('uploadVersion hace POST multipart a /versions con el archivo y sin reviewDate si está vacía', async () => {
    const { api, request } = fakeClient();
    const file = new File(['%PDF-1.7'], 'manual v2.pdf', { type: 'application/pdf' });

    await api.uploadVersion(ID, { file, reviewDate: '' });

    const [path, init] = request.mock.calls[0];
    const form = init.body as FormData;
    expect(path).toBe(`/api/documents/${ID}/versions`);
    expect(init.method).toBe('POST');
    expect(form.get('file')).toBe(file);
    expect([...form.keys()]).toEqual(['file']);
  });

  test('uploadVersion manda reviewDate cuando tiene valor', async () => {
    const { api, request } = fakeClient();
    const file = new File(['%PDF-1.7'], 'manual v2.pdf', { type: 'application/pdf' });

    await api.uploadVersion(ID, { file, reviewDate: '2027-05-01' });

    expect((request.mock.calls[0][1].body as FormData).get('reviewDate')).toBe('2027-05-01');
  });

  test('archiveDocument hace POST a /archive y devuelve el documento archivado', async () => {
    const { api, request } = fakeClient(ARCHIVED);

    await expect(api.archiveDocument(ID)).resolves.toEqual(ARCHIVED);
    expect(request).toHaveBeenCalledWith(`/api/documents/${ID}/archive`, {
      method: 'POST',
      signal: undefined,
    });
  });

  test('listVersions pide /versions', async () => {
    const { api, request } = fakeClient({ data: [] });

    await api.listVersions(ID);

    expect(request).toHaveBeenCalledWith(`/api/documents/${ID}/versions`, { signal: undefined });
  });

  test('getVersionDownloadUrl pide /versions/:versionId/download', async () => {
    const { api, request } = fakeClient({ url: 'https://…', expiresAt: '2026-10-23T15:05:00.000Z' });

    await api.getVersionDownloadUrl(ID, VERSION_ID);

    expect(request).toHaveBeenCalledWith(
      `/api/documents/${ID}/versions/${VERSION_ID}/download`,
      { signal: undefined },
    );
  });

  test('los dos ids se codifican', async () => {
    const { api, request } = fakeClient();

    await api.getVersionDownloadUrl('../x', 'a/b?c');
    await api.changeAreas('../x', { areaIds: [AREA] });

    expect(request.mock.calls[0][0]).toBe('/api/documents/..%2Fx/versions/a%2Fb%3Fc/download');
    expect(request.mock.calls[1][0]).toBe('/api/documents/..%2Fx/areas');
  });
});

// Spec 004 (T10; plan 004, 1.2): la búsqueda.
describe('searchDocuments', () => {
  test('codifica el texto y pide la página con 20 resultados', async () => {
    const { api, request } = fakeClient({ data: [], total: 0, page: 2, limit: 20 });

    await api.searchDocuments('cierre & caja', 2);

    expect(request).toHaveBeenCalledWith(
      '/api/documents/search?q=cierre%20%26%20caja&page=2&limit=20',
      { signal: undefined },
    );
  });

  test('pasa la señal para cancelar el pedido', async () => {
    const { api, request } = fakeClient({ data: [], total: 0, page: 1, limit: 20 });
    const signal = new AbortController().signal;

    await api.searchDocuments('caja', 1, signal);

    expect(request).toHaveBeenCalledWith('/api/documents/search?q=caja&page=1&limit=20', {
      signal,
    });
  });

  test('devuelve los resultados con su fragmento', async () => {
    const response: DocumentSearchResponse = {
      data: [
        {
          ...DOCUMENT,
          archivedAt: null,
          fragment: { parts: [{ text: 'caja', match: true }], pageNumber: 4 },
        },
      ],
      total: 1,
      page: 1,
      limit: 20,
    };
    const { api } = fakeClient(response);

    await expect(api.searchDocuments('caja', 1)).resolves.toEqual(response);
  });
});
