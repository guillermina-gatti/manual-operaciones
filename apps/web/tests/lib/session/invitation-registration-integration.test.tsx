import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import RegistroPage from '@/app/registro/page';
import { RequireRole } from '@/components/session/RequireRole';
import { createApiClient } from '@/lib/api';
import {
  __resetSessionForTests,
  getAuthHeaders,
  logoutSession,
  refreshSession,
  SessionProvider,
  useSession,
} from '@/lib/session/real-session';

const routerMocks = vi.hoisted(() => ({
  replace: vi.fn(),
  pathname: '/registro',
  searchParams: new URLSearchParams(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: routerMocks.replace }),
  usePathname: () => routerMocks.pathname,
  useSearchParams: () => routerMocks.searchParams,
}));

const VALID_TOKEN_43 = 'abcdefghijklmnopqrstuvwxyz0123456789-_ABCDE';

const makeJwt = (sub: string, role = 'ADMIN', seq = 1) => {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
    .replace(/=+$/, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  const payload = btoa(JSON.stringify({ sub, role, seq }))
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

function ProtectedAdminContent() {
  return <div data-testid="protected-admin-content">Carga de nuevo documento habilitada</div>;
}

function SessionStatusProbe() {
  const { user, status } = useSession();
  return (
    <div data-testid="session-probe">
      <span data-testid="probe-status">{status}</span>
      <span data-testid="probe-user">{user ? `${user.name}:${user.role}` : 'none'}</span>
    </div>
  );
}

describe('HU29: M5.4 - Integración de punta a punta de registro por invitación y sesión real', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    __resetSessionForTests();
    vi.resetAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    window.history.replaceState(null, '', '/registro');
    window.location.hash = '';
    routerMocks.pathname = '/registro';
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

  describe('1. Flujo exitoso de punta a punta y autorización según rol', () => {
    test('invitación ADMIN: valida token, registra usuario, establece JWT en memoria, redirige a /documentos/nuevo, autoriza en RequireRole y adjunta Authorization en createApiClient', async () => {
      const adminUser = {
        id: '11111111-1111-4111-8111-111111111111',
        name: 'Ana Administradora',
        email: 'ana.admin@empresa.com',
        role: 'ADMIN' as const,
      };
      const initialJwt = makeJwt(adminUser.id, 'ADMIN', 1);

      window.history.replaceState(
        null,
        '',
        `/registro?returnTo=%2Fdocumentos%2Fnuevo#token=${VALID_TOKEN_43}`,
      );
      window.location.hash = `#token=${VALID_TOKEN_43}`;
      routerMocks.searchParams = new URLSearchParams('returnTo=/documentos/nuevo');
      const replaceStateSpy = vi.spyOn(window.history, 'replaceState');

      let capturedAuthHeaderOnDocs: string | null = null;

      fetchMock.mockImplementation(async (input, init) => {
        const url = String(input);
        if (url.endsWith('/api/auth/refresh')) {
          return jsonResponse(401, { message: 'Sin sesión previa' });
        }
        if (url.endsWith('/api/auth/invitations/validate')) {
          const body = JSON.parse(String(init?.body ?? '{}')) as { token?: string };
          expect(body.token).toBe(VALID_TOKEN_43);
          return jsonResponse(200, {
            valid: true,
            email: adminUser.email,
            role: 'ADMIN',
          });
        }
        if (url.endsWith('/api/auth/register')) {
          const body = JSON.parse(String(init?.body ?? '{}')) as {
            token?: string;
            name?: string;
            password?: string;
          };
          expect(body).toEqual({
            token: VALID_TOKEN_43,
            name: 'Ana Administradora',
            password: 'ClaveSeguraAdmin2026!',
          });
          return jsonResponse(201, {
            accessToken: initialJwt,
            user: adminUser,
          });
        }
        if (url.endsWith('/api/documents')) {
          capturedAuthHeaderOnDocs = (init?.headers as Headers | undefined)?.get
            ? (init?.headers as Headers).get('Authorization')
            : ((init?.headers as Record<string, string>)?.['Authorization'] ?? null);
          return jsonResponse(200, { items: [{ id: 'doc-1', title: 'Manual Operativo' }], total: 1 });
        }
        return jsonResponse(200, {});
      });

      const { container, unmount } = render(
        <SessionProvider>
          <SessionStatusProbe />
          <RegistroPage />
        </SessionProvider>,
      );

      // 1. El hash se elimina tras extraer el token conservando query params
      await waitFor(() => {
        expect(replaceStateSpy).toHaveBeenCalledWith(
          null,
          '',
          '/registro?returnTo=%2Fdocumentos%2Fnuevo',
        );
      });

      // 2. El formulario se monta tras validar la invitación con el backend
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Completar registro' })).toBeInTheDocument();
      });

      expect(screen.getByLabelText('Correo electrónico')).toHaveValue(adminUser.email);
      expect(screen.getByLabelText('Correo electrónico')).toBeDisabled();
      expect(screen.getByText('Administrador')).toBeInTheDocument();
      expect(screen.getByTestId('probe-status')).toHaveTextContent('ready');
      expect(screen.getByTestId('probe-user')).toHaveTextContent('none');
      expect(container.innerHTML).not.toContain(VALID_TOKEN_43);

      // 3. El usuario completa el formulario y envía el registro
      const user = userEvent.setup();
      await user.type(screen.getByLabelText('Nombre completo'), '  Ana Administradora  ');
      await user.type(screen.getByLabelText('Contraseña'), 'ClaveSeguraAdmin2026!');
      await user.type(screen.getByLabelText('Confirmar contraseña'), 'ClaveSeguraAdmin2026!');
      await user.click(screen.getByRole('button', { name: 'Completar registro' }));

      // 4. Redirige a /documentos/nuevo y establece la sesión en memoria
      await waitFor(() => {
        expect(routerMocks.replace).toHaveBeenCalledWith('/documentos/nuevo');
      });

      expect(getAuthHeaders()).toEqual({ Authorization: `Bearer ${initialJwt}` });
      expect(localStorage.length).toBe(0);
      expect(sessionStorage.length).toBe(0);

      unmount();

      // 5. En el destino /documentos/nuevo, RequireRole autoriza el acceso para ADMIN
      render(
        <SessionProvider>
          <RequireRole role="ADMIN" deniedMessage="No tenés permiso para cargar documentos.">
            <ProtectedAdminContent />
          </RequireRole>
        </SessionProvider>,
      );

      expect(screen.getByTestId('protected-admin-content')).toBeInTheDocument();

      // 6. createApiClient adjunta el encabezado Authorization con el token en memoria
      const apiClient = createApiClient(getAuthHeaders, refreshSession);
      const docs = await apiClient.request<{ total: number }>('/api/documents');
      expect(docs.total).toBe(1);
      expect(capturedAuthHeaderOnDocs).toBe(`Bearer ${initialJwt}`);
    });

    test('invitación EMPLOYEE con returnTo=/documentos/nuevo: permite el registro y redirección interna, pero RequireRole bloquea el destino por rol insuficiente', async () => {
      const employeeUser = {
        id: '22222222-2222-4222-8222-222222222222',
        name: 'Elena Empleada',
        email: 'elena@empresa.com',
        role: 'EMPLOYEE' as const,
      };
      const employeeJwt = makeJwt(employeeUser.id, 'EMPLOYEE', 1);

      window.history.replaceState(
        null,
        '',
        `/registro?returnTo=%2Fdocumentos%2Fnuevo#token=${VALID_TOKEN_43}`,
      );
      window.location.hash = `#token=${VALID_TOKEN_43}`;
      routerMocks.searchParams = new URLSearchParams('returnTo=/documentos/nuevo');

      fetchMock.mockImplementation(async (input) => {
        const url = String(input);
        if (url.endsWith('/api/auth/refresh')) {
          return jsonResponse(401, { message: 'Sin sesión previa' });
        }
        if (url.endsWith('/api/auth/invitations/validate')) {
          return jsonResponse(200, {
            valid: true,
            email: employeeUser.email,
            role: 'EMPLOYEE',
          });
        }
        if (url.endsWith('/api/auth/register')) {
          return jsonResponse(201, {
            accessToken: employeeJwt,
            user: employeeUser,
          });
        }
        return jsonResponse(200, {});
      });

      const { unmount } = render(
        <SessionProvider>
          <RegistroPage />
        </SessionProvider>,
      );

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Completar registro' })).toBeInTheDocument();
      });
      expect(screen.getByText('Empleado')).toBeInTheDocument();

      const user = userEvent.setup();
      await user.type(screen.getByLabelText('Nombre completo'), 'Elena Empleada');
      await user.type(screen.getByLabelText('Contraseña'), 'ClaveSeguraEmp2026!');
      await user.type(screen.getByLabelText('Confirmar contraseña'), 'ClaveSeguraEmp2026!');
      await user.click(screen.getByRole('button', { name: 'Completar registro' }));

      await waitFor(() => {
        expect(routerMocks.replace).toHaveBeenCalledWith('/documentos/nuevo');
      });

      unmount();

      // Al renderizar la vista protegida para ADMIN con la sesión EMPLOYEE recién creada, RequireRole bloquea
      render(
        <SessionProvider>
          <RequireRole role="ADMIN" deniedMessage="No tenés permiso para cargar documentos.">
            <ProtectedAdminContent />
          </RequireRole>
        </SessionProvider>,
      );

      expect(screen.queryByTestId('protected-admin-content')).not.toBeInTheDocument();
      expect(screen.getByText('No tenés permiso para cargar documentos.')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Volver a Documentos' })).toHaveAttribute(
        'href',
        '/documentos',
      );
    });
  });

  describe('2. Renovación (refresh) y cierre de sesión (logout) después del registro', () => {
    test('usa el token inicial, rota el token ante un 401 mediante refresh y revoca la sesión al hacer logout bloqueando RequireRole', async () => {
      const adminUser = {
        id: '11111111-1111-4111-8111-111111111111',
        name: 'Ana Administradora',
        email: 'ana.admin@empresa.com',
        role: 'ADMIN' as const,
      };
      const initialJwt = makeJwt(adminUser.id, 'ADMIN', 1);
      const rotatedJwt = makeJwt(adminUser.id, 'ADMIN', 2);

      window.location.hash = `#token=${VALID_TOKEN_43}`;

      fetchMock.mockImplementation(async (input) => {
        const url = String(input);
        if (url.endsWith('/api/auth/refresh')) {
          return jsonResponse(401, { message: 'Sin sesión previa' });
        }
        if (url.endsWith('/api/auth/invitations/validate')) {
          return jsonResponse(200, {
            valid: true,
            email: adminUser.email,
            role: 'ADMIN',
          });
        }
        if (url.endsWith('/api/auth/register')) {
          return jsonResponse(201, {
            accessToken: initialJwt,
            user: adminUser,
          });
        }
        return jsonResponse(200, {});
      });

      const { unmount } = render(
        <SessionProvider>
          <RegistroPage />
        </SessionProvider>,
      );

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Completar registro' })).toBeInTheDocument();
      });

      const user = userEvent.setup();
      await user.type(screen.getByLabelText('Nombre completo'), 'Ana Administradora');
      await user.type(screen.getByLabelText('Contraseña'), 'ClaveSegura2026!');
      await user.type(screen.getByLabelText('Confirmar contraseña'), 'ClaveSegura2026!');
      await user.click(screen.getByRole('button', { name: 'Completar registro' }));

      await waitFor(() => {
        expect(getAuthHeaders()).toEqual({ Authorization: `Bearer ${initialJwt}` });
      });

      unmount();

      // Configuramos el cliente API y el escenario de expiración y rotación
      const apiClient = createApiClient(getAuthHeaders, refreshSession);
      const observedAuthHeaders: Array<string | null> = [];
      let refreshCount = 0;
      let logoutCount = 0;
      let docsCallCount = 0;

      fetchMock.mockImplementation(async (input, init) => {
        const url = String(input);
        const authHeader = (init?.headers as Headers | undefined)?.get
          ? (init?.headers as Headers).get('Authorization')
          : ((init?.headers as Record<string, string>)?.['Authorization'] ?? null);

        if (url.endsWith('/api/documents')) {
          docsCallCount++;
          observedAuthHeaders.push(authHeader);
          // 1ra llamada: éxito con token inicial
          if (docsCallCount === 1) {
            return jsonResponse(200, { items: [], total: 0 });
          }
          // 2da llamada: simula vencimiento del access token inicial (401)
          if (docsCallCount === 2) {
            return jsonResponse(401, { message: 'Token expirado' });
          }
          // 3ra llamada (reintento automático): debe traer el rotatedJwt
          if (authHeader === `Bearer ${rotatedJwt}`) {
            return jsonResponse(200, { items: [{ id: 'd1' }], total: 1 });
          }
          return jsonResponse(401, { message: 'Token inválido' });
        }

        if (url.endsWith('/api/auth/refresh')) {
          refreshCount++;
          return jsonResponse(200, {
            accessToken: rotatedJwt,
            user: adminUser,
          });
        }

        if (url.endsWith('/api/auth/logout')) {
          logoutCount++;
          return jsonResponse(200, { revoked: true });
        }

        return jsonResponse(200, {});
      });

      // 1. Primera petición API usa el access token inicial del registro
      await apiClient.request('/api/documents');
      expect(observedAuthHeaders[0]).toBe(`Bearer ${initialJwt}`);

      // 2 y 3. Segunda petición recibe 401, dispara refresh y reintenta con el nuevo access token
      const secondResult = await apiClient.request<{ total: number }>('/api/documents');
      expect(secondResult.total).toBe(1);
      expect(refreshCount).toBe(1);
      expect(observedAuthHeaders[1]).toBe(`Bearer ${initialJwt}`);
      expect(observedAuthHeaders[2]).toBe(`Bearer ${rotatedJwt}`);
      expect(getAuthHeaders()).toEqual({ Authorization: `Bearer ${rotatedJwt}` });

      // 4 y 5. Logout limpia inmediatamente la sesión en memoria y revoca en el servidor
      await act(async () => {
        await logoutSession();
      });

      expect(getAuthHeaders()).toEqual({});
      expect(logoutCount).toBe(1);

      // 6. RequireRole vuelve a bloquear el acceso tras el logout
      render(
        <SessionProvider>
          <SessionStatusProbe />
          <RequireRole role="ADMIN" deniedMessage="Solo administradores">
            <ProtectedAdminContent />
          </RequireRole>
        </SessionProvider>,
      );

      expect(screen.getByTestId('probe-status')).toHaveTextContent('ready');
      expect(screen.getByTestId('probe-user')).toHaveTextContent('none');
      expect(screen.queryByTestId('protected-admin-content')).not.toBeInTheDocument();
      expect(
        screen.getByText('Necesitás iniciar sesión para acceder a esta sección.'),
      ).toBeInTheDocument();
    });
  });

  describe('3. Manejo de fallos de validación, fallos de registro y sesión preexistente', () => {
    test('fallo en validación inicial (410 Gone): muestra alerta segura y enlace a /login sin montar el formulario', async () => {
      window.location.hash = `#token=${VALID_TOKEN_43}`;

      fetchMock.mockImplementation(async (input) => {
        const url = String(input);
        if (url.endsWith('/api/auth/refresh')) {
          return jsonResponse(401, { message: 'Sin sesión' });
        }
        if (url.endsWith('/api/auth/invitations/validate')) {
          return jsonResponse(410, {
            message: 'Invitation token has expired in database table user_invitations',
          });
        }
        return jsonResponse(200, {});
      });

      const { container } = render(
        <SessionProvider>
          <SessionStatusProbe />
          <RegistroPage />
        </SessionProvider>,
      );

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent('Esta invitación ya fue utilizada, expiró o fue revocada.');
      expect(alert).not.toHaveTextContent('user_invitations');
      expect(screen.getByRole('link', { name: 'Ir a iniciar sesión' })).toHaveAttribute(
        'href',
        '/login',
      );
      expect(screen.queryByLabelText('Nombre completo')).not.toBeInTheDocument();
      expect(getAuthHeaders()).toEqual({});
      expect(screen.getByTestId('probe-status')).toHaveTextContent('ready');
      expect(screen.getByTestId('probe-user')).toHaveTextContent('none');
      expect(container.innerHTML).not.toContain(VALID_TOKEN_43);
    });

    test('fallo al enviar el registro (410/409): mantiene el formulario montado durante el envío, vuelve a EMPTY_SESSION, conserva el nombre ingresado, muestra error visible, no revalida la invitación y no redirige', async () => {
      window.location.hash = `#token=${VALID_TOKEN_43}`;
      const passwordSecret = 'MiClaveSuperSecreta2026!';
      let validateCalls = 0;
      let resolveRegisterResponse!: (res: Response) => void;
      const registerResponsePromise = new Promise<Response>((resolve) => {
        resolveRegisterResponse = resolve;
      });

      fetchMock.mockImplementation(async (input) => {
        const url = String(input);
        if (url.endsWith('/api/auth/refresh')) {
          return jsonResponse(401, { message: 'Sin sesión' });
        }
        if (url.endsWith('/api/auth/invitations/validate')) {
          validateCalls++;
          return jsonResponse(200, {
            valid: true,
            email: 'invitado@empresa.com',
            role: 'SUPERVISOR',
          });
        }
        if (url.endsWith('/api/auth/register')) {
          return registerResponsePromise;
        }
        return jsonResponse(200, {});
      });

      const { container } = render(
        <SessionProvider>
          <SessionStatusProbe />
          <RegistroPage />
        </SessionProvider>,
      );

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Completar registro' })).toBeInTheDocument();
      });
      expect(validateCalls).toBe(1);

      const user = userEvent.setup();
      const nameInput = screen.getByLabelText('Nombre completo');
      await user.type(nameInput, 'Sergio Supervisor');
      await user.type(screen.getByLabelText('Contraseña'), passwordSecret);
      await user.type(screen.getByLabelText('Confirmar contraseña'), passwordSecret);
      await user.click(screen.getByRole('button', { name: 'Completar registro' }));

      // 1. Durante el envío (mientras real-session está en status='loading'), el formulario permanece montado
      await waitFor(() => {
        expect(screen.getByTestId('probe-status')).toHaveTextContent('loading');
      });
      expect(screen.getByRole('button', { name: 'Creando cuenta…' })).toBeDisabled();
      expect(screen.getByLabelText('Nombre completo')).toHaveValue('Sergio Supervisor');
      expect(screen.queryByText('Preparando sesión…')).not.toBeInTheDocument();

      // 2. Resolvemos la petición de registro con fallo 410
      resolveRegisterResponse(
        jsonResponse(410, {
          message: 'CAS update failed: acceptedAt is not null',
        }),
      );

      // 3. El mensaje de error permanece visible y sin detalles internos
      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent('Esta invitación ya fue utilizada, expiró o fue revocada.');
      expect(alert).not.toHaveTextContent('acceptedAt');

      // 4. El estado de la sesión vuelve a EMPTY_SESSION (status: 'ready', user: null) y sin token
      expect(screen.getByTestId('probe-status')).toHaveTextContent('ready');
      expect(screen.getByTestId('probe-user')).toHaveTextContent('none');
      expect(getAuthHeaders()).toEqual({});

      // 5. El nombre ingresado permanece disponible para el usuario y no se revalidó la invitación
      expect(screen.getByLabelText('Nombre completo')).toHaveValue('Sergio Supervisor');
      expect(validateCalls).toBe(1);

      // 6. No se produce ninguna redirección
      expect(routerMocks.replace).not.toHaveBeenCalled();

      // 7. No se filtran tokens ni contraseñas en mensajes o atributos del DOM
      expect(alert.textContent).not.toContain(VALID_TOKEN_43);
      expect(alert.textContent).not.toContain(passwordSecret);
      expect(container.innerHTML).not.toContain(VALID_TOKEN_43);
    });

    test('si existe una sesión activa al abrir /registro#token=..., no valida ni registra y conserva intacta la sesión previa', async () => {
      const activeUser = {
        id: '99999999-9999-4999-8999-999999999999',
        name: 'Grace Hopper',
        email: 'grace@empresa.com',
        role: 'ADMIN' as const,
      };
      const activeJwt = makeJwt(activeUser.id, 'ADMIN', 10);

      window.location.hash = `#token=${VALID_TOKEN_43}`;

      let validateCalls = 0;
      let registerCalls = 0;

      fetchMock.mockImplementation(async (input) => {
        const url = String(input);
        if (url.endsWith('/api/auth/refresh')) {
          return jsonResponse(200, {
            accessToken: activeJwt,
            user: activeUser,
          });
        }
        if (url.endsWith('/api/auth/invitations/validate')) {
          validateCalls++;
          return jsonResponse(200, { valid: true, email: 'otro@empresa.com', role: 'EMPLOYEE' });
        }
        if (url.endsWith('/api/auth/register')) {
          registerCalls++;
          return jsonResponse(201, {});
        }
        return jsonResponse(200, {});
      });

      render(
        <SessionProvider>
          <SessionStatusProbe />
          <RegistroPage />
        </SessionProvider>,
      );

      await waitFor(() => {
        expect(screen.getByText(/Ya ingresaste como/)).toBeInTheDocument();
      });

      expect(screen.getByText('Grace Hopper')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Ir a documentos' })).toHaveAttribute(
        'href',
        '/documentos',
      );
      expect(validateCalls).toBe(0);
      expect(registerCalls).toBe(0);
      expect(getAuthHeaders()).toEqual({ Authorization: `Bearer ${activeJwt}` });
      expect(screen.getByTestId('probe-status')).toHaveTextContent('ready');
      expect(screen.getByTestId('probe-user')).toHaveTextContent('Grace Hopper:ADMIN');
    });
  });
});
