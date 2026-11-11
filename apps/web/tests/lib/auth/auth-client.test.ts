import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  AuthClientError,
  login,
  logout,
  refresh,
  registerWithInvitation,
  validateInvitation,
} from '@/lib/auth/auth-client';

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

  test('refresh solicita rotación de cookie y recibe el accessToken y user según A-06.5', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, {
      accessToken: 'nuevo-jwt',
      user: sampleUser,
    }));

    await expect(refresh()).resolves.toEqual({
      accessToken: 'nuevo-jwt',
      user: sampleUser,
    });
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

  describe('HU29: validateInvitation', () => {
    const validToken = 'V1StGXR8_Z5jdHi6B-myTEYWgkUVnxI4463m48EEUIU';

    test('llama a /api/auth/invitations/validate por POST con el token en el cuerpo JSON y credentials same-origin', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(200, {
          valid: true,
          email: 'invitado@example.test',
          role: 'EMPLOYEE',
        }),
      );

      const result = await validateInvitation(validToken);

      expect(result).toEqual({
        valid: true,
        email: 'invitado@example.test',
        role: 'EMPLOYEE',
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('/api/auth/invitations/validate');
      expect(init?.method).toBe('POST');
      expect(init?.credentials).toBe('same-origin');
      expect(new Headers(init?.headers).get('Content-Type')).toBe('application/json');
      expect(JSON.parse(String(init?.body))).toEqual({ token: validToken });
      expect(url).not.toContain(validToken);
    });

    test.each([
      [400, 'token de invitación no es válido'],
      [404, 'invitación no existe o el enlace es incorrecto'],
      [410, 'ya fue utilizada, expiró o fue revocada'],
      [429, 'Demasiados intentos'],
      [503, 'servicio no está disponible'],
    ])('validateInvitation convierte el error HTTP %i en un mensaje seguro', async (status, snippet) => {
      fetchMock.mockResolvedValue(
        jsonResponse(status, {
          message: 'internal server details: query execution failed',
        }),
      );

      await expect(validateInvitation(validToken)).rejects.toMatchObject({
        name: 'AuthClientError',
        status,
        message: expect.stringContaining(snippet),
      });
    });

    test('validateInvitation ante fallo de red devuelve AuthClientError con status 0', async () => {
      fetchMock.mockRejectedValue(new TypeError('NetworkError'));
      await expect(validateInvitation(validToken)).rejects.toMatchObject({
        name: 'AuthClientError',
        status: 0,
        message: expect.stringContaining('No pudimos conectarnos'),
      });
    });

    test('validateInvitation rechaza respuestas con formato o rol inválido', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(200, { valid: true, email: '' }));
      fetchMock.mockResolvedValueOnce(jsonResponse(200, { valid: true, email: 'a@b.c', role: 'INVALID_ROLE' }));

      await expect(validateInvitation(validToken)).rejects.toMatchObject({ status: 0 });
      await expect(validateInvitation(validToken)).rejects.toMatchObject({ status: 0 });
    });
  });

  describe('HU29: registerWithInvitation', () => {
    const validToken = 'V1StGXR8_Z5jdHi6B-myTEYWgkUVnxI4463m48EEUIU';

    test('llama a /api/auth/register por POST enviando únicamente token, name y password', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(201, {
          accessToken: 'jwt-registro',
          user: sampleUser,
        }),
      );

      const result = await registerWithInvitation(
        validToken,
        'Ana Administradora',
        'PasswordValido123!',
      );

      expect(result).toEqual({ accessToken: 'jwt-registro', user: sampleUser });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('/api/auth/register');
      expect(init?.method).toBe('POST');
      expect(init?.credentials).toBe('same-origin');
      expect(new Headers(init?.headers).get('Content-Type')).toBe('application/json');

      const body = JSON.parse(String(init?.body));
      expect(body).toEqual({
        token: validToken,
        name: 'Ana Administradora',
        password: 'PasswordValido123!',
      });
      // Comprobar que no se envían role ni áreas
      expect(body).not.toHaveProperty('role');
      expect(body).not.toHaveProperty('areaIds');

      // Comprobar ausencia de persistencia en Web Storage
      expect(localStorage.length).toBe(0);
      expect(sessionStorage.length).toBe(0);
    });

    test.each([
      [400, 'Revisá los datos ingresados'],
      [404, 'invitación no existe o el enlace es incorrecto'],
      [409, 'correo ya se encuentra registrado o la invitación fue utilizada simultáneamente'],
      [410, 'ya fue utilizada, expiró o fue revocada'],
      [429, 'Demasiados intentos'],
      [503, 'servicio no está disponible'],
    ])('registerWithInvitation convierte el error HTTP %i en un mensaje seguro', async (status, snippet) => {
      fetchMock.mockResolvedValue(
        jsonResponse(status, {
          message: 'internal leak: constraint violation on user_invitations',
        }),
      );

      await expect(
        registerWithInvitation(validToken, 'Elena', 'Pass1234!'),
      ).rejects.toMatchObject({
        name: 'AuthClientError',
        status,
        message: expect.stringContaining(snippet),
      });
    });

    test('registerWithInvitation ante fallo de red devuelve AuthClientError con status 0', async () => {
      fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
      await expect(
        registerWithInvitation(validToken, 'Elena', 'Pass1234!'),
      ).rejects.toMatchObject({
        name: 'AuthClientError',
        status: 0,
        message: expect.stringContaining('No pudimos conectarnos'),
      });
    });

    test('registerWithInvitation rechaza respuesta con formato de usuario inválido', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(201, {
          accessToken: 'jwt-incompleto',
          user: { id: 'sin-nombre' },
        }),
      );

      await expect(
        registerWithInvitation(validToken, 'Elena', 'Pass1234!'),
      ).rejects.toMatchObject({
        name: 'AuthClientError',
        status: 0,
      });
    });
  });
});
