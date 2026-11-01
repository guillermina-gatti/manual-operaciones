import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import {
  getAuthHeaders,
  loginSession,
  logoutSession,
  refreshSession,
  restoreSession,
  SessionProvider,
  useSession,
} from '@/lib/session/real-session';

const auth = vi.hoisted(() => ({
  login: vi.fn(),
  refresh: vi.fn(),
  logout: vi.fn(),
}));

vi.mock('@/lib/auth/auth-client', () => auth);

const USER = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  role: 'ADMIN' as const,
};

const token = (sub: string, n: number) => {
  const payload = btoa(JSON.stringify({ sub, n }))
    .replace(/=+$/, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  return `eyJhbGciOiJIUzI1NiJ9.${payload}.firma`;
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

const wrapper = ({ children }: { children: ReactNode }) => (
  <SessionProvider>{children}</SessionProvider>
);

beforeEach(async () => {
  vi.resetAllMocks();
  auth.logout.mockResolvedValue({ revoked: true });
  auth.login.mockResolvedValue({ accessToken: token(USER.id, 1), user: USER });
  auth.refresh.mockResolvedValue({ accessToken: token(USER.id, 2) });
  localStorage.clear();
  sessionStorage.clear();
  await restoreSession();
});

describe('A-08b: estado real aislado', () => {
  test('sin login da usuario null y estado ready', () => {
    const { result } = renderHook(() => useSession(), { wrapper });
    expect(result.current).toEqual({ user: null, status: 'ready' });
    expect(getAuthHeaders()).toEqual({});
  });

  test('login conserva token en memoria y publica usuario real', async () => {
    const { result } = renderHook(() => useSession(), { wrapper });
    await act(async () => { await loginSession(USER.email, 'clave-prueba'); });
    expect(auth.login).toHaveBeenCalledWith(USER.email, 'clave-prueba');
    expect(result.current).toEqual({
      user: { id: USER.id, name: USER.name, role: 'ADMIN' },
      status: 'ready',
    });
    expect(getAuthHeaders()).toEqual({ Authorization: `Bearer ${token(USER.id, 1)}` });
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  test('login fallido no deja usuario ni JWT', async () => {
    auth.login.mockRejectedValueOnce(new Error('falló'));
    await expect(loginSession(USER.email, 'clave-incorrecta')).rejects.toThrow('falló');
    expect(getAuthHeaders()).toEqual({});
    const { result } = renderHook(() => useSession(), { wrapper });
    expect(result.current.user).toBeNull();
  });

  test('una renovación mantiene el usuario y sustituye el token', async () => {
    await loginSession(USER.email, 'clave');
    expect(await refreshSession()).toBe(true);
    expect(getAuthHeaders()).toEqual({ Authorization: `Bearer ${token(USER.id, 2)}` });
    expect(auth.refresh).toHaveBeenCalledTimes(1);
  });

  test('dos 401 concurrentes comparten exactamente un refresh', async () => {
    await loginSession(USER.email, 'clave');
    const gate = deferred<{ accessToken: string }>();
    auth.refresh.mockReturnValueOnce(gate.promise);
    const first = refreshSession();
    const second = refreshSession();
    expect(first).toBe(second);
    expect(auth.refresh).toHaveBeenCalledTimes(1);
    gate.resolve({ accessToken: token(USER.id, 2) });
    expect(await first).toBe(true);
    expect(await second).toBe(true);
  });

  test('rechaza refresh de otro usuario y descarta las credenciales', async () => {
    await loginSession(USER.email, 'clave');
    auth.refresh.mockResolvedValueOnce({ accessToken: token('usuario-distinto', 2) });
    expect(await refreshSession()).toBe(false);
    expect(getAuthHeaders()).toEqual({});
  });

  test('un refresh fallido descarta el token y no reintenta en bucle', async () => {
    await loginSession(USER.email, 'clave');
    auth.refresh.mockRejectedValueOnce(new Error('401'));
    expect(await refreshSession()).toBe(false);
    expect(getAuthHeaders()).toEqual({});
    expect(auth.refresh).toHaveBeenCalledTimes(1);
  });

  test('logout limpia estado local aunque el backend no responda', async () => {
    await loginSession(USER.email, 'clave');
    auth.logout.mockRejectedValueOnce(new Error('sin red'));
    const closing = logoutSession();
    expect(getAuthHeaders()).toEqual({});
    await expect(closing).rejects.toThrow('sin red');
    expect(auth.logout).toHaveBeenCalledTimes(1);
    const { result } = renderHook(() => useSession(), { wrapper });
    expect(result.current).toEqual({ user: null, status: 'ready' });
  });

  test('logout espera un refresh pendiente y el refresh tardío no restaura sesión', async () => {
    await loginSession(USER.email, 'clave');
    const gate = deferred<{ accessToken: string }>();
    auth.refresh.mockReturnValueOnce(gate.promise);
    const pending = refreshSession();
    const closing = logoutSession();
    expect(getAuthHeaders()).toEqual({});
    expect(auth.logout).not.toHaveBeenCalled();
    gate.resolve({ accessToken: token(USER.id, 2) });
    expect(await pending).toBe(false);
    await closing;
    expect(auth.logout).toHaveBeenCalledTimes(1);
    expect(getAuthHeaders()).toEqual({});
  });

  test('restaurar no inventa identidad desde fixtures ni storage', async () => {
    await loginSession(USER.email, 'clave');
    localStorage.setItem('sim-session', USER.id);
    await restoreSession();
    expect(getAuthHeaders()).toEqual({});
    expect(auth.refresh).not.toHaveBeenCalled();
    const { result } = renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(result.current).toEqual({ user: null, status: 'ready' }));
  });
});
