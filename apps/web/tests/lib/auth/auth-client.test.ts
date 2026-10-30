import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { AuthClientError, login, logout, refresh } from '@/lib/auth/auth-client';

const fetchMock = vi.fn<typeof fetch>();
const sampleUser = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Ana Administradora',
  email: 'ana@example.test',
  role: 'ADMIN',
};

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

describe('A-08a: cliente de autenticación', () => {
  test('login llama al backend real por la ruta relativa y conserva cookies same-origin', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, {
      accessToken: 'jwt-de-prueba',
      user: sampleUser,
    }));

    const result = await login('ana@example.test', 'password-de-prueba');

    expect(result).toEqual({ accessToken: 'jwt-de-prueba', user: sampleUser });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/auth/login');
    expect(init?.method).toBe('POST');
    expect(init?.credentials).toBe('same-origin');
    expect(new Headers(init?.headers).get('Content-Type')).toBe('application/json');
    expect(JSON.parse(String(init?.body))).toEqual({
      email: 'ana@example.test',
      password: 'password-de-prueba',
    });
    // Ningún token ni contraseña se persiste desde este cliente.
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  test('refresh solicita rotación de cookie y recibe el accessToken actual sin asumir A-06.5', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { accessToken: 'nuevo-jwt' }));

    await expect(refresh()).resolves.toEqual({ accessToken: 'nuevo-jwt' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/auth/refresh');
    expect(init?.method).toBe('POST');
    expect(init?.credentials).toBe('same-origin');
    expect(init?.body).toBeUndefined();
    expect(new Headers(init?.headers).has('Authorization')).toBe(false);
  });

  test('logout llama al backend y acepta revoked=false (sesión ya inexistente)', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { revoked: false }));

    await expect(logout()).resolves.toEqual({ revoked: false });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/auth/logout');
    expect(init?.credentials).toBe('same-origin');
  });

  test.each([
    [400, 'Revisá los datos'],
    [401, 'Correo o contraseña'],
    [429, 'Demasiados intentos'],
    [503, 'servicio no está disponible'],
  ])('login convierte el error HTTP %i en un mensaje seguro', async (status, snippet) => {
    fetchMock.mockResolvedValue(jsonResponse(status, {
      message: 'internal secret: contraseña-super-secreta',
    }));
    await expect(login('ana@example.test', 'contraseña-super-secreta')).rejects.toMatchObject({
      name: 'AuthClientError',
      status,
      message: expect.stringContaining(snippet),
    });
  });

  test('refresh con 401 da un mensaje de sesión vencida, distinto del login', async () => {
    fetchMock.mockResolvedValue(jsonResponse(401, { message: 'Sesión inválida' }));
    await expect(refresh()).rejects.toMatchObject({
      status: 401,
      message: 'La sesión venció. Volvé a iniciar sesión.',
    });
  });

  test('un error de red devuelve AuthClientError status 0', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(login('ana@example.test', 'clave')).rejects.toMatchObject({
      name: 'AuthClientError',
      status: 0,
    });
  });

  test('la respuesta malformada no se acepta como inicio de sesión', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, {
      accessToken: 'jwt',
      user: { ...sampleUser, role: 'SUPERADMIN' },
    }));
    await expect(login('ana@example.test', 'clave')).rejects.toBeInstanceOf(AuthClientError);
  });

  test('refresh y logout validan el formato del JSON', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { token: 'incorrecto' }));
    fetchMock.mockResolvedValueOnce(jsonResponse(200, {}));
    await expect(refresh()).rejects.toMatchObject({ status: 0 });
    await expect(logout()).rejects.toMatchObject({ status: 0 });
  });

  test('un 200 con HTML en lugar de JSON se rechaza sin filtrar datos', async () => {
    fetchMock.mockResolvedValue(new Response('<html>error</html>', { status: 200 }));
    await expect(login('ana@example.test', 'clave')).rejects.toMatchObject({ status: 0 });
  });
});
