import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { ApiError, createApiClient } from '@/lib/api';

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const client = createApiClient(() => ({
  'x-user-id': '0b000000-0000-4000-8000-000000000003',
  'x-user-role': 'EMPLOYEE',
}));

// Devuelve el error que lanza la promesa, para revisar sus campos.
async function errorOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('La promesa no falló');
}

describe('a dónde pide', () => {
  test('pide a la URL relativa /api/... y suma las cabeceras de la sesión', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { data: [] }));

    await client.request('/api/documents?page=1&limit=20');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/documents?page=1&limit=20');
    const headers = new Headers(init?.headers);
    expect(headers.get('x-user-id')).toBe('0b000000-0000-4000-8000-000000000003');
    expect(headers.get('x-user-role')).toBe('EMPLOYEE');
  });

  test.each([
    'http://localhost:3000/api/documents',
    'https://manual-docs.s3.amazonaws.com/documents/x.pdf',
    '//otro-sitio.com/api/documents',
    'documents',
    '/documentos',
  ])('rechaza %s sin llamar a fetch: solo se pide a /api/...', async (path) => {
    await expect(client.request(path)).rejects.toThrow('/api/');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('respuestas correctas', () => {
  test('un 2xx devuelve el JSON', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { id: 'abc', title: 'Manual' }));

    await expect(client.request('/api/documents/abc')).resolves.toEqual({
      id: 'abc',
      title: 'Manual',
    });
  });
});

describe('errores de la API', () => {
  test('un error con message como texto da ApiError con status y messages', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(404, { statusCode: 404, message: 'Not Found', error: 'Not Found' }),
    );

    const error = await errorOf(client.request('/api/documents/abc'));

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 404, messages: ['Not Found'] });
  });

  test('un error con message como arreglo conserva todos los textos', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(400, {
        statusCode: 400,
        message: [
          'title must be shorter than or equal to 200 characters',
          'ownerId must be a UUID',
        ],
        error: 'Bad Request',
      }),
    );

    const error = await errorOf(client.request('/api/documents', { method: 'POST' }));

    expect(error).toMatchObject({
      status: 400,
      messages: [
        'title must be shorter than or equal to 200 characters',
        'ownerId must be a UUID',
      ],
    });
  });

  test('un 409 conserva existingDocumentId', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(409, {
        statusCode: 409,
        message: 'Ya hay un documento vigente con el mismo archivo',
        error: 'Conflict',
        existingDocumentId: '11111111-1111-4111-8111-111111111111',
      }),
    );

    const error = await errorOf(client.request('/api/documents', { method: 'POST' }));

    expect(error).toMatchObject({
      status: 409,
      existingDocumentId: '11111111-1111-4111-8111-111111111111',
    });
  });

  test('un fallo de red da status 0', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    const error = await errorOf(client.request('/api/documents'));

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 0 });
  });

  test('una respuesta que no es JSON (el rewrite no encuentra el backend) da status 0', async () => {
    fetchMock.mockResolvedValue(
      new Response('<html>Internal Server Error</html>', {
        status: 500,
        headers: { 'Content-Type': 'text/html' },
      }),
    );

    const error = await errorOf(client.request('/api/documents'));

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 0 });
  });

  test('una cancelación (AbortError) no se convierte en ApiError', async () => {
    fetchMock.mockRejectedValue(new DOMException('Cancelado', 'AbortError'));

    const error = await errorOf(client.request('/api/documents'));

    expect(error).not.toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ name: 'AbortError' });
  });
});

describe('envío de archivos', () => {
  test('con FormData no fija Content-Type, para que el navegador ponga el boundary', async () => {
    fetchMock.mockResolvedValue(jsonResponse(201, { id: 'nuevo' }));
    const body = new FormData();
    body.append('title', 'Manual de caja');

    await client.request('/api/documents', { method: 'POST', body });

    const [, init] = fetchMock.mock.calls[0];
    expect(init?.body).toBe(body);
    expect(new Headers(init?.headers).has('Content-Type')).toBe(false);
  });
});
