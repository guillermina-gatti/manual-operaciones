// Fetch simulado para la sesión de desarrollo (plan 002, sección 3.1): responde /api/auth/login,
// /api/auth/refresh y /api/auth/logout como la API de la pareja A, y el resto con 200 {}.
import { vi } from 'vitest';
import { FIXTURE_USERS } from '@/lib/directory/fixtures';
import { DEV_FIXTURE_PASSWORD, devEmail } from '@/lib/session/dev-credentials';

// Un JWT con la forma del de la API: solo importa el `sub` del payload (la firma no se revisa en la web).
export function fakeAccessToken(userId: string, serial = 1): string {
  const encode = (value: object) =>
    btoa(JSON.stringify(value)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: userId, n: serial })}.firma`;
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const USERS = Object.values(FIXTURE_USERS);

export interface FakeAuthApi {
  fetch: ReturnType<typeof vi.fn<typeof fetch>>;
  // Quién tiene la cookie del refresh token ahora (null: ninguna), como el navegador.
  refreshCookieUserId: string | null;
  // Para responder lo que pida el test en /api/auth/refresh y en el resto de las rutas.
  refreshStatus: number;
  other: (path: string, init: RequestInit | undefined) => Response | Promise<Response>;
  calls: (path: string) => RequestInit[];
}

export function fakeAuthApi(): FakeAuthApi {
  let issued = 0;
  const api: FakeAuthApi = {
    fetch: vi.fn<typeof fetch>(),
    refreshCookieUserId: null,
    refreshStatus: 200,
    other: () => json(200, {}),
    calls: (path) =>
      api.fetch.mock.calls.filter(([url]) => url === path).map(([, init]) => init ?? {}),
  };

  api.fetch.mockImplementation(async (input, init) => {
    const path = String(input);
    if (path === '/api/auth/login') {
      const { email, password } = JSON.parse(String(init?.body)) as Record<string, string>;
      const user = USERS.find((candidate) => devEmail(candidate.id) === email);
      if (!user || password !== DEV_FIXTURE_PASSWORD) {
        return json(401, { statusCode: 401, message: 'Credenciales inválidas' });
      }
      api.refreshCookieUserId = user.id;
      issued += 1;
      return json(200, {
        accessToken: fakeAccessToken(user.id, issued),
        user: { id: user.id, name: user.name, email, role: user.role },
      });
    }
    if (path === '/api/auth/refresh') {
      if (api.refreshStatus !== 200 || !api.refreshCookieUserId) {
        return json(401, { statusCode: 401, message: 'Sesión inválida o expirada' });
      }
      issued += 1;
      return json(200, { accessToken: fakeAccessToken(api.refreshCookieUserId, issued) });
    }
    if (path === '/api/auth/logout') {
      api.refreshCookieUserId = null;
      return json(200, { revoked: true });
    }
    return api.other(path, init);
  });

  return api;
}
