import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { HomeView } from '@/components/home/HomeView';
import { LoginForm } from '@/components/session/LoginForm';
import { RequireRole } from '@/components/session/RequireRole';
import { ApiError, createApiClient } from '@/lib/api';
import {
  __resetSessionForTests,
  getAuthHeaders,
  loginSession,
  refreshSession,
  SessionProvider,
  useSession,
} from '@/lib/session/real-session';

const routerMocks = vi.hoisted(() => ({
  replace: vi.fn(),
  pathname: '/documentos/nuevo',
  searchParams: new URLSearchParams(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: routerMocks.replace }),
  usePathname: () => routerMocks.pathname,
  useSearchParams: () => routerMocks.searchParams,
}));

// Generador de JWT para simular tokens firmados consistentes
const makeJwt = (sub: string, role = 'ADMIN') => {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
    .replace(/=+$/, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  const payload = btoa(JSON.stringify({ sub, role, iat: Date.now() }))
    .replace(/=+$/, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  return `${header}.${payload}.signature`;
};

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

function ProtectedContent() {
  return <div data-testid="protected-content">Contenido confidencial protegido</div>;
}

describe('Integración de autenticación real y autorización en frontend (A-10b.4)', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    __resetSessionForTests();
    vi.resetAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    routerMocks.pathname = '/documentos/nuevo';
    routerMocks.searchParams = new URLSearchParams();
    vi.stubGlobal('fetch', fetchMock);

    // Por defecto, la restauración inicial al montar SessionProvider no encuentra sesión previa (401)
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/api/auth/refresh')) {
        return jsonResponse(401, { message: 'Sesión inválida o expirada' });
      }
      return jsonResponse(200, {});
    });
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  describe('1. Visitante sin sesión y ciclo de login / returnTo', () => {
    test('RequireRole bloquea contenido privado, genera returnTo hacia /login, permite login real y redirige', async () => {
      const { unmount: unmountFirst } = render(
        <SessionProvider>
          <RequireRole role="ADMIN" deniedMessage="No tenés permiso para cargar documentos.">
            <ProtectedContent />
          </RequireRole>
        </SessionProvider>,
      );

      // Esperar que la restauración inicial finalice en no autenticado
      await waitFor(() => {
        expect(
          screen.getByText('Necesitás iniciar sesión para acceder a esta sección.'),
        ).toBeInTheDocument();
      });

      // El contenido protegido NO debe estar montado
      expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();

      // Verifica el enlace a login con parámetro returnTo codificado
      const link = screen.getByRole('link', { name: 'Ir a iniciar sesión' });
      expect(link).toHaveAttribute('href', '/login?returnTo=%2Fdocumentos%2Fnuevo');

      unmountFirst();

      // Ahora simulamos que el usuario navega a /login con ese returnTo
      routerMocks.searchParams = new URLSearchParams('returnTo=%2Fdocumentos%2Fnuevo');

      const adminUser = {
        id: '11111111-1111-4111-8111-111111111111',
        name: 'Ana Administradora',
        email: 'ana@empresa.com',
        role: 'ADMIN' as const,
      };

      fetchMock.mockImplementation(async (input) => {
        const url = String(input);
        if (url.endsWith('/api/auth/login')) {
          return jsonResponse(200, {
            accessToken: makeJwt(adminUser.id, 'ADMIN'),
            user: adminUser,
          });
        }
        return jsonResponse(200, {});
      });

      render(
        <SessionProvider>
          <LoginForm />
        </SessionProvider>,
      );

      const user = userEvent.setup();
      await user.type(screen.getByLabelText(/correo electrónico/i), 'ana@empresa.com');
      await user.type(screen.getByLabelText(/contraseña/i), 'password123');
      await user.click(screen.getByRole('button', { name: /iniciar sesión/i }));

      // Verifica que el login redirige a la ruta original contenida en returnTo
      await waitFor(() => {
        expect(routerMocks.replace).toHaveBeenCalledWith('/documentos/nuevo');
      });

      // Una vez logueado como ADMIN, el componente protegido se monta correctamente
      render(
        <SessionProvider>
          <RequireRole role="ADMIN" deniedMessage="No tenés permiso para cargar documentos.">
            <ProtectedContent />
          </RequireRole>
        </SessionProvider>,
      );

      expect(screen.getByTestId('protected-content')).toBeInTheDocument();
      expect(screen.queryByText('Necesitás iniciar sesión para acceder a esta sección.')).not.toBeInTheDocument();
    });

    test('si tras el login el rol no tiene permisos, RequireRole deniega el acceso sin montar contenido', async () => {
      const employeeUser = {
        id: '22222222-2222-4222-8222-222222222222',
        name: 'Elena Empleada',
        email: 'elena@empresa.com',
        role: 'EMPLOYEE' as const,
      };

      fetchMock.mockImplementation(async (input) => {
        const url = String(input);
        if (url.endsWith('/api/auth/login')) {
          return jsonResponse(200, {
            accessToken: makeJwt(employeeUser.id, 'EMPLOYEE'),
            user: employeeUser,
          });
        }
        return jsonResponse(200, {});
      });

      await act(async () => {
        await loginSession(employeeUser.email, 'password123');
      });

      render(
        <SessionProvider>
          <RequireRole role="ADMIN" deniedMessage="No tenés permiso para cargar documentos.">
            <ProtectedContent />
          </RequireRole>
        </SessionProvider>,
      );

      expect(screen.getByText('No tenés permiso para cargar documentos.')).toBeInTheDocument();
      expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Volver a Documentos' })).toHaveAttribute('href', '/documentos');
    });
  });

  describe('2. Matriz de autorización por roles (EMPLOYEE, SUPERVISOR, ADMIN)', () => {
    test('EMPLOYEE accede a ruta role="EMPLOYEE", pero no a role="ADMIN" ni a roles=["ADMIN", "SUPERVISOR"]', async () => {
      const employee = {
        id: '22222222-2222-4222-8222-222222222222',
        name: 'Elena Empleada',
        email: 'elena@empresa.com',
        role: 'EMPLOYEE' as const,
      };
      fetchMock.mockImplementation(async (input) => {
        if (String(input).endsWith('/api/auth/login')) {
          return jsonResponse(200, { accessToken: makeJwt(employee.id, 'EMPLOYEE'), user: employee });
        }
        return jsonResponse(200, {});
      });
      await act(async () => {
        await loginSession(employee.email, 'clave');
      });

      // 1. Acceso permitido a role="EMPLOYEE"
      const { unmount: u1 } = render(
        <SessionProvider>
          <RequireRole role="EMPLOYEE" deniedMessage="Solo empleados">
            <ProtectedContent />
          </RequireRole>
        </SessionProvider>,
      );
      expect(screen.getByTestId('protected-content')).toBeInTheDocument();
      u1();

      // 2. Acceso denegado a role="ADMIN"
      const { unmount: u2 } = render(
        <SessionProvider>
          <RequireRole role="ADMIN" deniedMessage="Solo administradores">
            <ProtectedContent />
          </RequireRole>
        </SessionProvider>,
      );
      expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
      expect(screen.getByText('Solo administradores')).toBeInTheDocument();
      u2();

      // 3. Acceso denegado a roles=['ADMIN', 'SUPERVISOR']
      const { unmount: u3 } = render(
        <SessionProvider>
          <RequireRole roles={['ADMIN', 'SUPERVISOR']} deniedMessage="Solo admin o supervisor">
            <ProtectedContent />
          </RequireRole>
        </SessionProvider>,
      );
      expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
      expect(screen.getByText('Solo admin o supervisor')).toBeInTheDocument();
      u3();
    });

    test('SUPERVISOR accede a roles=["ADMIN", "SUPERVISOR"], pero no a role="EMPLOYEE" ni a role="ADMIN"', async () => {
      const supervisor = {
        id: '33333333-3333-4333-8333-333333333333',
        name: 'Sergio Supervisor',
        email: 'sergio@empresa.com',
        role: 'SUPERVISOR' as const,
      };
      fetchMock.mockImplementation(async (input) => {
        if (String(input).endsWith('/api/auth/login')) {
          return jsonResponse(200, { accessToken: makeJwt(supervisor.id, 'SUPERVISOR'), user: supervisor });
        }
        return jsonResponse(200, {});
      });
      await act(async () => {
        await loginSession(supervisor.email, 'clave');
      });

      // 1. Acceso permitido a roles=['ADMIN', 'SUPERVISOR']
      const { unmount: u1 } = render(
        <SessionProvider>
          <RequireRole roles={['ADMIN', 'SUPERVISOR']} deniedMessage="Solo admin o supervisor">
            <ProtectedContent />
          </RequireRole>
        </SessionProvider>,
      );
      expect(screen.getByTestId('protected-content')).toBeInTheDocument();
      u1();

      // 2. Acceso denegado a role="EMPLOYEE"
      const { unmount: u2 } = render(
        <SessionProvider>
          <RequireRole role="EMPLOYEE" deniedMessage="Solo empleados">
            <ProtectedContent />
          </RequireRole>
        </SessionProvider>,
      );
      expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
      expect(screen.getByText('Solo empleados')).toBeInTheDocument();
      u2();

      // 3. Acceso denegado a role="ADMIN"
      const { unmount: u3 } = render(
        <SessionProvider>
          <RequireRole role="ADMIN" deniedMessage="Solo admin">
            <ProtectedContent />
          </RequireRole>
        </SessionProvider>,
      );
      expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
      expect(screen.getByText('Solo admin')).toBeInTheDocument();
      u3();
    });

    test('ADMIN accede a role="ADMIN" y roles=["ADMIN", "SUPERVISOR"], pero no a role="EMPLOYEE"', async () => {
      const admin = {
        id: '11111111-1111-4111-8111-111111111111',
        name: 'Ana Administradora',
        email: 'ana@empresa.com',
        role: 'ADMIN' as const,
      };
      fetchMock.mockImplementation(async (input) => {
        if (String(input).endsWith('/api/auth/login')) {
          return jsonResponse(200, { accessToken: makeJwt(admin.id, 'ADMIN'), user: admin });
        }
        return jsonResponse(200, {});
      });
      await act(async () => {
        await loginSession(admin.email, 'clave');
      });

      // 1. Acceso permitido a role="ADMIN"
      const { unmount: u1 } = render(
        <SessionProvider>
          <RequireRole role="ADMIN" deniedMessage="Solo admin">
            <ProtectedContent />
          </RequireRole>
        </SessionProvider>,
      );
      expect(screen.getByTestId('protected-content')).toBeInTheDocument();
      u1();

      // 2. Acceso permitido a roles=['ADMIN', 'SUPERVISOR']
      const { unmount: u2 } = render(
        <SessionProvider>
          <RequireRole roles={['ADMIN', 'SUPERVISOR']} deniedMessage="Solo admin o supervisor">
            <ProtectedContent />
          </RequireRole>
        </SessionProvider>,
      );
      expect(screen.getByTestId('protected-content')).toBeInTheDocument();
      u2();

      // 3. Acceso denegado a role="EMPLOYEE"
      const { unmount: u3 } = render(
        <SessionProvider>
          <RequireRole role="EMPLOYEE" deniedMessage="Solo los empleados pueden ejecutar procedimientos.">
            <ProtectedContent />
          </RequireRole>
        </SessionProvider>,
      );
      expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
      expect(
        screen.getByText('Solo los empleados pueden ejecutar procedimientos.'),
      ).toBeInTheDocument();
      u3();
    });

    test('distingue correctamente la visibilidad contextual en HomeView de la protección real en RequireRole', async () => {
      const admin = {
        id: '11111111-1111-4111-8111-111111111111',
        name: 'Ana Admin',
        email: 'admin@empresa.com',
        role: 'ADMIN' as const,
      };
      fetchMock.mockImplementation(async (input) => {
        if (String(input).endsWith('/api/auth/login')) {
          return jsonResponse(200, { accessToken: makeJwt(admin.id, 'ADMIN'), user: admin });
        }
        return jsonResponse(200, {});
      });
      await act(async () => {
        await loginSession(admin.email, 'clave');
      });

      // En HomeView, ADMIN ve tarjetas de Documentos y Métricas, pero no ve la tarjeta de Ejecuciones
      const { unmount } = render(
        <SessionProvider>
          <HomeView />
        </SessionProvider>,
      );
      expect(screen.getByRole('link', { name: 'Ver documentos →' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Ver métricas →' })).toBeInTheDocument();
      expect(screen.queryByText('Ejecuciones y recorridos')).not.toBeInTheDocument();
      unmount();

      // Si ADMIN navega directamente a la URL protegida /ejecuciones, RequireRole actúa como barrera real
      render(
        <SessionProvider>
          <RequireRole role="EMPLOYEE" deniedMessage="Solo los empleados pueden ejecutar procedimientos.">
            <ProtectedContent />
          </RequireRole>
        </SessionProvider>,
      );
      expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
      expect(
        screen.getByText('Solo los empleados pueden ejecutar procedimientos.'),
      ).toBeInTheDocument();
    });
  });

  describe('3. Respuestas HTTP y comportamiento de apiClient con real-session', () => {
    test('401 sin token: no debe producir un refresh innecesario y lanza ApiError(401)', async () => {
      const client = createApiClient(getAuthHeaders, refreshSession);

      let refreshAttempts = 0;
      fetchMock.mockImplementation(async (input) => {
        const url = String(input);
        if (url.endsWith('/api/auth/refresh')) {
          refreshAttempts++;
          return jsonResponse(401, { message: 'Sin refresh token' });
        }
        if (url.endsWith('/api/documents')) {
          return jsonResponse(401, { message: 'Token de acceso requerido' });
        }
        return jsonResponse(200, {});
      });

      // Sin haber iniciado sesión, getAuthHeaders() devuelve {}
      expect(getAuthHeaders()).toEqual({});

      await expect(client.request('/api/documents')).rejects.toThrow(ApiError);
      try {
        await client.request('/api/documents');
      } catch (err) {
        expect(err).toBeInstanceOf(ApiError);
        expect((err as ApiError).status).toBe(401);
      }

      // Al no haber credenciales previas para refrescar, no debe invocar refresh
      expect(refreshAttempts).toBe(0);
    });

    test('401 con access token vencido: intenta refresh una sola vez, actualiza sesión y repite el request', async () => {
      const admin = {
        id: '11111111-1111-4111-8111-111111111111',
        name: 'Ana Admin',
        email: 'admin@empresa.com',
        role: 'ADMIN' as const,
      };

      const tokenExpirado = makeJwt(admin.id, 'ADMIN');
      const nuevoJwt = makeJwt(admin.id, 'ADMIN');

      fetchMock.mockImplementation(async (input) => {
        if (String(input).endsWith('/api/auth/login')) {
          return jsonResponse(200, { accessToken: tokenExpirado, user: admin });
        }
        return jsonResponse(200, {});
      });

      await act(async () => {
        await loginSession(admin.email, 'password123');
      });

      let refreshCalls = 0;
      let documentsCount = 0;
      const client = createApiClient(getAuthHeaders, refreshSession);

      fetchMock.mockImplementation(async (input, init) => {
        const url = String(input);
        if (url.endsWith('/api/auth/refresh')) {
          refreshCalls++;
          return jsonResponse(200, {
            accessToken: nuevoJwt,
            user: admin,
          });
        }

        if (url.endsWith('/api/documents')) {
          documentsCount++;
          // La primera llamada falla con 401 (token expirado)
          if (documentsCount === 1) {
            return jsonResponse(401, { message: 'Token expirado' });
          }
          // El retry luego de refresh exitoso devuelve 200 con documentos
          const auth = (init?.headers as Headers | undefined)?.get
            ? (init?.headers as Headers).get('Authorization')
            : (init?.headers as Record<string, string>)?.[
                'Authorization'
              ];
          if (auth === `Bearer ${nuevoJwt}`) {
            return jsonResponse(200, { items: [{ id: 'doc-1', title: 'Manual A' }], total: 1 });
          }
          return jsonResponse(401, { message: 'Token incorrecto' });
        }

        return jsonResponse(200, {});
      });

      const res = await client.request<{ items: unknown[]; total: number }>('/api/documents');
      expect(res.total).toBe(1);
      expect(refreshCalls).toBe(1); // Se intentó refrescar exactamente una vez
      expect(documentsCount).toBe(2); // Request original + retry automático exitoso
      expect(getAuthHeaders()).toEqual({ Authorization: `Bearer ${nuevoJwt}` });
    });

    test('401 con access token y refresh fallido: limpia la sesión y deja de montar contenido privado', async () => {
      const admin = {
        id: '11111111-1111-4111-8111-111111111111',
        name: 'Ana Admin',
        email: 'admin@empresa.com',
        role: 'ADMIN' as const,
      };

      const tokenInicial = makeJwt(admin.id, 'ADMIN');

      fetchMock.mockImplementation(async (input) => {
        const url = String(input);
        if (url.endsWith('/api/auth/login') || url.endsWith('/api/auth/refresh')) {
          return jsonResponse(200, { accessToken: tokenInicial, user: admin });
        }
        return jsonResponse(200, {});
      });

      await act(async () => {
        await loginSession(admin.email, 'clave');
      });

      function ConsumerComponent() {
        const { user } = useSession();
        return (
          <RequireRole role="ADMIN" deniedMessage="No tenés permiso">
            <div data-testid="live-protected">{user?.name}</div>
          </RequireRole>
        );
      }

      const { unmount } = render(
        <SessionProvider>
          <ConsumerComponent />
        </SessionProvider>,
      );

      await waitFor(() => {
        expect(screen.getByTestId('live-protected')).toHaveTextContent('Ana Admin');
      });

      unmount();

      // Configuramos falla en refresh
      fetchMock.mockImplementation(async (input) => {
        const url = String(input);
        if (url.endsWith('/api/auth/refresh')) {
          return jsonResponse(401, { message: 'Refresh token revocado o sesión expirada' });
        }
        return jsonResponse(401, { message: 'Token expirado' });
      });

      const client = createApiClient(getAuthHeaders, refreshSession);

      await expect(client.request('/api/documents')).rejects.toThrow(ApiError);

      // La sesión debe haberse limpiado en memoria
      expect(getAuthHeaders()).toEqual({});

      // En el siguiente render de RequireRole, el contenido privado ya no se monta y pide login
      render(
        <SessionProvider>
          <ConsumerComponent />
        </SessionProvider>,
      );

      await waitFor(() => {
        expect(
          screen.getByText('Necesitás iniciar sesión para acceder a esta sección.'),
        ).toBeInTheDocument();
      });
      expect(screen.queryByTestId('live-protected')).not.toBeInTheDocument();
    });

    test('403 Forbidden: conserva la sesión activa y no intenta refresh', async () => {
      const supervisor = {
        id: '33333333-3333-4333-8333-333333333333',
        name: 'Sergio Supervisor',
        email: 'sergio@empresa.com',
        role: 'SUPERVISOR' as const,
      };

      const supToken = makeJwt(supervisor.id, 'SUPERVISOR');
      fetchMock.mockImplementation(async (input) => {
        if (String(input).endsWith('/api/auth/login')) {
          return jsonResponse(200, { accessToken: supToken, user: supervisor });
        }
        return jsonResponse(200, {});
      });

      await act(async () => {
        await loginSession(supervisor.email, 'clave');
      });

      let refreshAttempts = 0;
      fetchMock.mockImplementation(async (input) => {
        const url = String(input);
        if (url.endsWith('/api/auth/refresh')) {
          refreshAttempts++;
          return jsonResponse(200, { accessToken: 'nuevo-token', user: supervisor });
        }
        if (url.endsWith('/api/documents/admin-only-action')) {
          return jsonResponse(403, { message: 'No tiene permisos para realizar esta acción' });
        }
        return jsonResponse(200, {});
      });

      const client = createApiClient(getAuthHeaders, refreshSession);

      await expect(
        client.request('/api/documents/admin-only-action', {
          method: 'POST',
          body: JSON.stringify({}),
        }),
      ).rejects.toThrow(ApiError);

      // El error 403 NO debe desencadenar refresh
      expect(refreshAttempts).toBe(0);

      // La sesión activa de Sergio Supervisor se mantiene intacta
      expect(getAuthHeaders()).toEqual({ Authorization: `Bearer ${supToken}` });
    });

    test('404 por área no autorizada: se propaga sin cerrar sesión ni intentar refresh', async () => {
      const supervisor = {
        id: '33333333-3333-4333-8333-333333333333',
        name: 'Sergio Supervisor',
        email: 'sergio@empresa.com',
        role: 'SUPERVISOR' as const,
      };

      const supToken = makeJwt(supervisor.id, 'SUPERVISOR');
      fetchMock.mockImplementation(async (input) => {
        if (String(input).endsWith('/api/auth/login')) {
          return jsonResponse(200, { accessToken: supToken, user: supervisor });
        }
        return jsonResponse(200, {});
      });

      await act(async () => {
        await loginSession(supervisor.email, 'clave');
      });

      let refreshAttempts = 0;
      fetchMock.mockImplementation(async (input) => {
        const url = String(input);
        if (url.endsWith('/api/auth/refresh')) {
          refreshAttempts++;
          return jsonResponse(200, { accessToken: 'token-refrescado', user: supervisor });
        }
        if (url.endsWith('/api/documents/doc-area-ajena')) {
          return jsonResponse(404, { message: 'El recurso no existe o no es visible para el usuario' });
        }
        return jsonResponse(200, {});
      });

      const client = createApiClient(getAuthHeaders, refreshSession);

      let caughtError: unknown;
      try {
        await client.request('/api/documents/doc-area-ajena');
      } catch (err) {
        caughtError = err;
      }

      expect(caughtError).toBeInstanceOf(ApiError);
      expect((caughtError as ApiError).status).toBe(404);
      expect((caughtError as ApiError).message).toContain('El recurso no existe o no es visible para el usuario');

      // Ni se intentó refrescar token ni se invalidó la sesión
      expect(refreshAttempts).toBe(0);
      expect(getAuthHeaders()).toEqual({ Authorization: `Bearer ${supToken}` });
    });
  });
});
