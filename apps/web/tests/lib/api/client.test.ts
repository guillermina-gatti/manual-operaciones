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

const client = createApiClient(() => ({ Authorization: 'Bearer token-de-prueba' }));

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
    expect(headers.get('Authorization')).toBe('Bearer token-de-prueba');
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

describe('reason de los 409 (spec 003, D7)', () => {
  test('un 409 con reason lo conserva en ApiError.reason', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(409, {
        statusCode: 409,
        message: 'El archivo es igual a la versión vigente',
        error: 'Conflict',
        reason: 'IDENTICAL_TO_CURRENT',
      }),
    );

    const error = await errorOf(client.request('/api/documents/x/versions', { method: 'POST' }));

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 409, reason: 'IDENTICAL_TO_CURRENT' });
  });

  test('sin reason, o con un reason que no es texto, queda undefined', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(404, { statusCode: 404, message: 'x' }));
    fetchMock.mockResolvedValueOnce(jsonResponse(409, { statusCode: 409, reason: 7 }));

    expect(((await errorOf(client.request('/api/documents/x'))) as ApiError).reason).toBeUndefined();
    expect(((await errorOf(client.request('/api/documents/x'))) as ApiError).reason).toBeUndefined();
  });
});

// Plan 002, sección 3.1: con un token vencido la API da 401; el cliente renueva una vez y repite.
describe('renovación ante un 401', () => {
  let token = 'vencido';
  const refreshAuth = vi.fn<() => Promise<boolean>>();
  const withRefresh = createApiClient(
    (): Record<string, string> => (token ? { Authorization: `Bearer ${token}` } : {}),
    refreshAuth,
  );
  const unauthorized = () => jsonResponse(401, { statusCode: 401, message: 'No autenticado' });
  const sentAuthorization = (call: number) =>
    new Headers(fetchMock.mock.calls[call][1]?.headers).get('Authorization');

  beforeEach(() => {
    token = 'vencido';
    refreshAuth.mockReset();
  });

  test('si el refresh funciona, repite el pedido con el token nuevo y devuelve su respuesta', async () => {
    fetchMock.mockResolvedValueOnce(unauthorized()).mockResolvedValueOnce(jsonResponse(200, { ok: 1 }));
    refreshAuth.mockImplementation(async () => {
      token = 'nuevo';
      return true;
    });

    await expect(withRefresh.request('/api/documents')).resolves.toEqual({ ok: 1 });

    expect(refreshAuth).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sentAuthorization(0)).toBe('Bearer vencido');
    expect(sentAuthorization(1)).toBe('Bearer nuevo');
  });

  test('repite el mismo pedido: método, cuerpo y señal', async () => {
    fetchMock.mockResolvedValueOnce(unauthorized()).mockResolvedValueOnce(jsonResponse(201, {}));
    refreshAuth.mockResolvedValue(true);
    const body = new FormData();
    body.append('title', 'Manual');
    const signal = new AbortController().signal;

    await withRefresh.request('/api/documents', { method: 'POST', body, signal });

    const [, retry] = fetchMock.mock.calls[1];
    expect(retry).toMatchObject({ method: 'POST', body, signal });
  });

  test('intenta una sola vez: si el pedido repetido da 401, lanza ApiError 401', async () => {
    fetchMock.mockResolvedValueOnce(unauthorized()).mockResolvedValueOnce(unauthorized());
    refreshAuth.mockResolvedValue(true);

    const error = await errorOf(withRefresh.request('/api/documents'));

    expect(error).toMatchObject({ status: 401 });
    expect(refreshAuth).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test('si el refresh falla, no repite y lanza el 401 original', async () => {
    fetchMock.mockResolvedValueOnce(unauthorized());
    refreshAuth.mockResolvedValue(false);

    const error = await errorOf(withRefresh.request('/api/documents'));

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 401 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('sin sesión (sin token) un 401 no intenta renovar', async () => {
    token = '';
    fetchMock.mockResolvedValueOnce(unauthorized());

    await expect(withRefresh.request('/api/documents')).rejects.toMatchObject({ status: 401 });

    expect(refreshAuth).not.toHaveBeenCalled();
  });

  test('un 403 no intenta renovar', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(403, { statusCode: 403, message: 'No' }));

    await expect(withRefresh.request('/api/documents')).rejects.toMatchObject({ status: 403 });

    expect(refreshAuth).not.toHaveBeenCalled();
  });
});
