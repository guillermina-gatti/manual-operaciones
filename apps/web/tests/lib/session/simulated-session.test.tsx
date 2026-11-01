import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { apiClient } from '@/lib/api';
import { FIXTURE_USERS } from '@/lib/directory/fixtures';
import {
  SessionProvider,
  SIM_SESSION_KEY,
  getAuthHeaders,
  refreshSession,
  restoreSession,
  selectDevUser,
  useSession,
} from '@/lib/session';
import { DEV_FIXTURE_PASSWORD } from '@/lib/session/dev-credentials';
import { fakeAccessToken, fakeAuthApi } from '../../support/session';
import type { FakeAuthApi } from '../../support/session';

const empleadoVentas = FIXTURE_USERS.empleadoVentas;
const admin = FIXTURE_USERS.admin;

const wrapper = ({ children }: { children: ReactNode }) => (
  <SessionProvider>{children}</SessionProvider>
);

let api: FakeAuthApi;

beforeEach(async () => {
  localStorage.clear();
  api = fakeAuthApi();
  vi.stubGlobal('fetch', api.fetch);
  // La sesión vive en memoria del módulo: cada test arranca desde lo que hay en localStorage (nada).
  await restoreSession();
  api.fetch.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const bearer = () => getAuthHeaders().Authorization;

describe('la sesión de desarrollo no funciona en producción', () => {
  beforeEach(() => {
    // Aunque haya un usuario de prueba guardado, en producción no se usa.
    localStorage.setItem(SIM_SESSION_KEY, empleadoVentas.id);
    vi.stubEnv('NODE_ENV', 'production');
  });

  test('useSession no da ningún usuario y avisa que está desactivada', () => {
    const { result } = renderHook(() => useSession(), { wrapper });

    expect(result.current).toEqual({ user: null, status: 'disabled' });
  });

  test('no inicia sesión ni da cabeceras', async () => {
    await restoreSession();
    await selectDevUser(admin.id);

    expect(api.fetch).not.toHaveBeenCalled();
    expect(getAuthHeaders()).toEqual({});
  });

  test('los pedidos a la API salen sin Authorization', async () => {
    await apiClient.request('/api/documents');

    const headers = new Headers(api.fetch.mock.calls[0][1]?.headers);
    expect(headers.has('Authorization')).toBe(false);
  });
});

describe('elegir un usuario inicia sesión de verdad', () => {
  test('hace POST /api/auth/login con su email y la contraseña de desarrollo', async () => {
    await selectDevUser(empleadoVentas.id);

    const [login] = api.calls('/api/auth/login');
    expect(login.method).toBe('POST');
    expect(new Headers(login.headers).get('Content-Type')).toBe('application/json');
    expect(JSON.parse(String(login.body))).toEqual({
      email: 'empleadoventas@fixtures.test',
      password: DEV_FIXTURE_PASSWORD,
    });
  });

  test('getAuthHeaders da Authorization: Bearer con el accessToken del login', async () => {
    await selectDevUser(empleadoVentas.id);

    expect(getAuthHeaders()).toEqual({
      Authorization: `Bearer ${fakeAccessToken(empleadoVentas.id, 1)}`,
    });
  });

  test('el token queda en memoria: en localStorage solo está el ID del usuario elegido', async () => {
    await selectDevUser(empleadoVentas.id);

    expect(Object.keys(localStorage)).toEqual([SIM_SESSION_KEY]);
    expect(localStorage.getItem(SIM_SESSION_KEY)).toBe(empleadoVentas.id);
    expect(JSON.stringify(localStorage)).not.toContain(fakeAccessToken(empleadoVentas.id, 1));
  });

  test('useSession da "loading" mientras inicia sesión y después el usuario', async () => {
    const { result } = renderHook(() => useSession(), { wrapper });

    let pending!: Promise<void>;
    act(() => {
      pending = selectDevUser(empleadoVentas.id);
    });
    expect(result.current).toEqual({ user: null, status: 'loading' });

    await act(() => pending);
    expect(result.current).toEqual({
      user: { id: empleadoVentas.id, name: empleadoVentas.name, role: 'EMPLOYEE' },
      status: 'ready',
    });
  });

  test('apiClient manda el Bearer de la sesión', async () => {
    await selectDevUser(empleadoVentas.id);

    await apiClient.request('/api/documents');

    const [, init] = api.fetch.mock.calls.at(-1)!;
    expect(new Headers(init?.headers).get('Authorization')).toBe(
      `Bearer ${fakeAccessToken(empleadoVentas.id, 1)}`,
    );
  });

  test('cambiar de usuario cierra la sesión anterior y abre la nueva', async () => {
    await selectDevUser(admin.id);
    await selectDevUser(empleadoVentas.id);

    expect(api.calls('/api/auth/logout')).toHaveLength(1);
    expect(api.calls('/api/auth/login')).toHaveLength(2);
    expect(bearer()).toBe(`Bearer ${fakeAccessToken(empleadoVentas.id, 2)}`);
  });

  test('si el login falla, queda sin usuario y sin cabeceras', async () => {
    api.other = () => new Response('{}', { status: 200 });
    api.fetch.mockImplementationOnce(async () => new Response('{}', { status: 503 }));
    const { result } = renderHook(() => useSession(), { wrapper });

    await act(() => selectDevUser(admin.id));

    expect(result.current).toEqual({ user: null, status: 'ready' });
    expect(getAuthHeaders()).toEqual({});
  });

  test('si se elige otro usuario antes de que termine el primer login, gana el último', async () => {
    const first = selectDevUser(admin.id);
    const second = selectDevUser(empleadoVentas.id);
    await Promise.all([first, second]);

    expect(bearer()).toBe(`Bearer ${fakeAccessToken(empleadoVentas.id, 2)}`);
    const { result } = renderHook(() => useSession(), { wrapper });
    expect(result.current.user?.id).toBe(empleadoVentas.id);
  });
});

describe('"Sin sesión" cierra la sesión', () => {
  test('hace POST /api/auth/logout, borra el token y sim-session', async () => {
    await selectDevUser(admin.id);
    const { result } = renderHook(() => useSession(), { wrapper });

    await act(() => selectDevUser(null));

    expect(api.calls('/api/auth/logout')).toHaveLength(1);
    expect(getAuthHeaders()).toEqual({});
    expect(localStorage.getItem(SIM_SESSION_KEY)).toBeNull();
    expect(result.current).toEqual({ user: null, status: 'ready' });
  });
});

describe('al cargar la página', () => {
  test('sin sim-session no hay usuario, ni cabeceras, ni pedidos de login', async () => {
    const { result } = renderHook(() => useSession(), { wrapper });

    expect(result.current).toEqual({ user: null, status: 'ready' });
    expect(getAuthHeaders()).toEqual({});
    expect(api.fetch).not.toHaveBeenCalled();
  });

  test('con sim-session y la cookie de ese usuario, renueva con /api/auth/refresh sin volver a loguear', async () => {
    localStorage.setItem(SIM_SESSION_KEY, admin.id);
    api.refreshCookieUserId = admin.id;

    await restoreSession();

    expect(api.calls('/api/auth/refresh')).toHaveLength(1);
    expect(api.calls('/api/auth/login')).toHaveLength(0);
    expect(bearer()).toBe(`Bearer ${fakeAccessToken(admin.id, 1)}`);
  });

  test('si la cookie no sirve o es de otro usuario, inicia sesión con el guardado', async () => {
    localStorage.setItem(SIM_SESSION_KEY, empleadoVentas.id);
    api.refreshCookieUserId = admin.id;

    await restoreSession();

    expect(api.calls('/api/auth/login')).toHaveLength(1);
    expect(bearer()).toBe(`Bearer ${fakeAccessToken(empleadoVentas.id, 2)}`);
  });

  test('un ID que no está en los fixtures se trata como sin sesión', async () => {
    localStorage.setItem(SIM_SESSION_KEY, '99999999-9999-4999-8999-999999999999');

    await restoreSession();

    const { result } = renderHook(() => useSession(), { wrapper });
    expect(result.current.user).toBeNull();
    expect(getAuthHeaders()).toEqual({});
    expect(api.calls('/api/auth/login')).toHaveLength(0);
  });

  test('si otra pestaña cambia sim-session, esta pestaña pasa a ese usuario', async () => {
    const { result } = renderHook(() => useSession(), { wrapper });
    expect(result.current.user).toBeNull();

    act(() => {
      localStorage.setItem(SIM_SESSION_KEY, admin.id);
      window.dispatchEvent(new StorageEvent('storage', { key: SIM_SESSION_KEY }));
    });

    await waitFor(() => expect(result.current.user?.role).toBe('ADMIN'));
    expect(bearer()).toMatch(/^Bearer /);
  });
});

describe('refreshSession (cuando un pedido da 401 por token vencido)', () => {
  test('pide /api/auth/refresh una vez y cambia el token en memoria', async () => {
    await selectDevUser(admin.id);

    expect(await refreshSession()).toBe(true);

    expect(api.calls('/api/auth/refresh')).toHaveLength(1);
    expect(bearer()).toBe(`Bearer ${fakeAccessToken(admin.id, 2)}`);
  });

  test('varios 401 a la vez comparten un solo refresh (la API rota el refresh token)', async () => {
    await selectDevUser(admin.id);

    const results = await Promise.all([refreshSession(), refreshSession(), refreshSession()]);

    expect(results).toEqual([true, true, true]);
    expect(api.calls('/api/auth/refresh')).toHaveLength(1);
  });

  test('si el refresh falla, la sesión termina: sin usuario ni token', async () => {
    await selectDevUser(admin.id);
    api.refreshStatus = 401;
    const { result } = renderHook(() => useSession(), { wrapper });

    let refreshed!: boolean;
    await act(async () => {
      refreshed = await refreshSession();
    });

    expect(refreshed).toBe(false);
    expect(getAuthHeaders()).toEqual({});
    expect(result.current).toEqual({ user: null, status: 'ready' });
  });

  test('sin sesión no pide nada', async () => {
    expect(await refreshSession()).toBe(false);
    expect(api.fetch).not.toHaveBeenCalled();
  });
});

test('useSession fuera de SessionProvider lanza un error', () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});

  expect(() => renderHook(() => useSession())).toThrow('SessionProvider');
});
