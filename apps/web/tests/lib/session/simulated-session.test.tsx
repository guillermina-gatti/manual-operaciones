import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { apiClient } from '@/lib/api';
import { FIXTURE_USERS } from '@/lib/directory/fixtures';
import {
  SessionProvider,
  SIM_SESSION_KEY,
  getAuthHeaders,
  useSession,
} from '@/lib/session';

const empleadoVentas = FIXTURE_USERS.empleadoVentas;

const wrapper = ({ children }: { children: ReactNode }) => (
  <SessionProvider>{children}</SessionProvider>
);

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  localStorage.clear();
  fetchMock.mockResolvedValue(new Response('{}', { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('la sesión simulada no funciona en producción', () => {
  beforeEach(() => {
    // Aunque haya un usuario de prueba guardado, en producción no se usa.
    localStorage.setItem(SIM_SESSION_KEY, empleadoVentas.id);
    vi.stubEnv('NODE_ENV', 'production');
  });

  test('useSession no da ningún usuario y avisa que está desactivada', () => {
    const { result } = renderHook(() => useSession(), { wrapper });

    expect(result.current).toEqual({ user: null, status: 'disabled' });
  });

  test('getAuthHeaders no da cabeceras', () => {
    expect(getAuthHeaders()).toEqual({});
  });

  test('los pedidos a la API salen sin x-user-id ni x-user-role', async () => {
    await apiClient.request('/api/documents');

    const headers = new Headers(fetchMock.mock.calls[0][1]?.headers);
    expect(headers.has('x-user-id')).toBe(false);
    expect(headers.has('x-user-role')).toBe(false);
  });
});

describe('en desarrollo', () => {
  test('sin sim-session no hay usuario ni cabeceras', () => {
    const { result } = renderHook(() => useSession(), { wrapper });

    expect(result.current).toEqual({ user: null, status: 'ready' });
    expect(getAuthHeaders()).toEqual({});
  });

  test('con el ID del EMPLOYEE de Ventas da ese usuario y sus cabeceras', () => {
    localStorage.setItem(SIM_SESSION_KEY, empleadoVentas.id);

    const { result } = renderHook(() => useSession(), { wrapper });

    expect(result.current).toEqual({
      user: { id: empleadoVentas.id, name: empleadoVentas.name, role: 'EMPLOYEE' },
      status: 'ready',
    });
    expect(getAuthHeaders()).toEqual({
      'x-user-id': empleadoVentas.id,
      'x-user-role': 'EMPLOYEE',
    });
  });

  test('un ID que no está en los fixtures se trata como sin sesión', () => {
    localStorage.setItem(SIM_SESSION_KEY, '99999999-9999-4999-8999-999999999999');

    const { result } = renderHook(() => useSession(), { wrapper });

    expect(result.current.user).toBeNull();
    expect(getAuthHeaders()).toEqual({});
  });

  test('si otra pestaña cambia sim-session, la sesión se actualiza', () => {
    const { result } = renderHook(() => useSession(), { wrapper });
    expect(result.current.user).toBeNull();

    act(() => {
      localStorage.setItem(SIM_SESSION_KEY, FIXTURE_USERS.admin.id);
      window.dispatchEvent(new StorageEvent('storage', { key: SIM_SESSION_KEY }));
    });

    expect(result.current.user?.role).toBe('ADMIN');
  });

  test('apiClient manda las cabeceras de la sesión', async () => {
    localStorage.setItem(SIM_SESSION_KEY, empleadoVentas.id);

    await apiClient.request('/api/documents');

    const headers = new Headers(fetchMock.mock.calls[0][1]?.headers);
    expect(headers.get('x-user-id')).toBe(empleadoVentas.id);
    expect(headers.get('x-user-role')).toBe('EMPLOYEE');
  });

  test('useSession fuera de SessionProvider lanza un error', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => renderHook(() => useSession())).toThrow('SessionProvider');
  });
});
