// Spec 009 (T10, F9, D10): client.stream, para leer transmisiones con la misma sesión que request.
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

const sseResponse = (body: string) =>
  new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

async function errorOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('La promesa no falló');
}

describe('client.stream (spec 009)', () => {
  const client = createApiClient(() => ({ Authorization: 'Bearer token-de-prueba' }));

  test('solo pide rutas /api/…', async () => {
    await expect(client.stream('/otra/cosa')).rejects.toThrow('/api/');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('manda los encabezados de sesión y devuelve la respuesta sin leerla', async () => {
    fetchMock.mockResolvedValue(sseResponse('event: start\ndata: {}\n\n'));

    const response = await client.stream('/api/chat/stream', { method: 'POST', body: '{}' });

    const [path, init] = fetchMock.mock.calls[0];
    expect(path).toBe('/api/chat/stream');
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer token-de-prueba');
    expect(init?.method).toBe('POST');
    expect(response.bodyUsed).toBe(false);
    expect(await response.text()).toBe('event: start\ndata: {}\n\n');
  });

  test('un error con JSON lanza el mismo ApiError que request', async () => {
    fetchMock.mockResolvedValue(jsonResponse(404, { statusCode: 404, message: 'Conversación no encontrada' }));

    const error = await errorOf(client.stream('/api/chat/stream', { method: 'POST' }));

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 404, messages: ['Conversación no encontrada'] });
  });

  test('un error que no es JSON es un ApiError con status 0', async () => {
    fetchMock.mockResolvedValue(new Response('<html>caído</html>', { status: 502 }));

    expect(await errorOf(client.stream('/api/chat/stream'))).toMatchObject({ status: 0 });
  });

  test('sin conexión, ApiError con status 0', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    expect(await errorOf(client.stream('/api/chat/stream'))).toMatchObject({ status: 0 });
  });

  test('un pedido cortado deja pasar el AbortError', async () => {
    fetchMock.mockRejectedValue(new DOMException('cortado', 'AbortError'));

    expect(await errorOf(client.stream('/api/chat/stream'))).toMatchObject({ name: 'AbortError' });
  });
});

describe('client.stream con renovación de la sesión', () => {
  const refreshAuth = vi.fn<() => Promise<boolean>>();
  let token = 'vencido';
  const client = createApiClient(() => ({ Authorization: `Bearer ${token}` }), refreshAuth);

  afterEach(() => {
    refreshAuth.mockReset();
    token = 'vencido';
  });

  test('un 401 renueva una vez y repite el pedido con el token nuevo', async () => {
    refreshAuth.mockImplementation(async () => {
      token = 'nuevo';
      return true;
    });
    fetchMock
      .mockResolvedValueOnce(jsonResponse(401, { statusCode: 401, message: 'Unauthorized' }))
      .mockResolvedValueOnce(sseResponse('event: start\ndata: {}\n\n'));

    const response = await client.stream('/api/chat/stream', { method: 'POST' });

    expect(response.status).toBe(200);
    expect(refreshAuth).toHaveBeenCalledTimes(1);
    expect(new Headers(fetchMock.mock.calls[1][1]?.headers).get('Authorization')).toBe('Bearer nuevo');
  });

  test('si no se puede renovar, lanza el 401', async () => {
    refreshAuth.mockResolvedValue(false);
    fetchMock.mockResolvedValue(jsonResponse(401, { statusCode: 401, message: 'Unauthorized' }));

    expect(await errorOf(client.stream('/api/chat/stream'))).toMatchObject({ status: 401 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
