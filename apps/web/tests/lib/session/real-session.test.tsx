import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import {
  __resetSessionForTests,
  getAuthHeaders,
  loginSession,
  logoutSession,
  refreshSession,
  registerSession,
  restoreSession,
  SessionProvider,
  useSession,
} from '@/lib/session/real-session';

const auth = vi.hoisted(() => ({
  login: vi.fn(),
  refresh: vi.fn(),
  logout: vi.fn(),
  registerWithInvitation: vi.fn(),
  validateInvitation: vi.fn(),
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
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

const wrapper = ({ children }: { children: ReactNode }) => (
  <SessionProvider>{children}</SessionProvider>
);

beforeEach(() => {
  __resetSessionForTests();
  vi.resetAllMocks();
  auth.logout.mockResolvedValue({ revoked: true });
  auth.login.mockResolvedValue({ accessToken: token(USER.id, 1), user: USER });
  auth.refresh.mockResolvedValue({ accessToken: token(USER.id, 2), user: USER });
  auth.registerWithInvitation.mockResolvedValue({
    accessToken: token(USER.id, 1),
    user: USER,
  });
  localStorage.clear();
  sessionStorage.clear();
});

describe('A-08b: estado real aislado', () => {
  test('sin login previo da usuario null y estado ready', async () => {
    auth.refresh.mockRejectedValueOnce(new Error('sin sesion previa'));
    const { result } = renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(result.current).toEqual({ user: null, status: 'ready' }));
    expect(getAuthHeaders()).toEqual({});
  });

  test('login conserva token en memoria y publica usuario real', async () => {
    auth.refresh.mockRejectedValueOnce(new Error('sin sesion previa'));
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
    auth.refresh.mockRejectedValueOnce(new Error('sin sesion previa'));
    auth.login.mockRejectedValueOnce(new Error('falló'));
    await expect(loginSession(USER.email, 'clave-incorrecta')).rejects.toThrow('falló');
    expect(getAuthHeaders()).toEqual({});
    const { result } = renderHook(() => useSession(), { wrapper });
    expect(result.current.user).toBeNull();
  });

  describe('HU29: registerSession', () => {
    test('rechaza el registro si ya existe una sesión activa, sin llamar al backend y conservando usuario y token', async () => {
      auth.refresh.mockRejectedValueOnce(new Error('sin sesion previa'));
      await loginSession(USER.email, 'clave-prueba');
      expect(getAuthHeaders()).toEqual({ Authorization: `Bearer ${token(USER.id, 1)}` });

      await expect(
        registerSession('token-43-chars', 'Otro Nombre', 'ClaveNueva123!'),
      ).rejects.toThrow('Ya existe una sesión activa');

      expect(auth.registerWithInvitation).not.toHaveBeenCalled();

      const { result } = renderHook(() => useSession(), { wrapper });
      expect(result.current).toEqual({
        user: { id: USER.id, name: USER.name, role: 'ADMIN' },
        status: 'ready',
      });
      expect(getAuthHeaders()).toEqual({ Authorization: `Bearer ${token(USER.id, 1)}` });
    });

    test('registro sin sesión y con error permanece sin autenticar en EMPTY_SESSION', async () => {
      auth.refresh.mockRejectedValueOnce(new Error('sin sesion previa'));
      auth.registerWithInvitation.mockRejectedValueOnce(new Error('invitacion-invalida'));
      await expect(
        registerSession('token-invalido', USER.name, 'clave'),
      ).rejects.toThrow('invitacion-invalida');
      expect(getAuthHeaders()).toEqual({});
      const { result } = renderHook(() => useSession(), { wrapper });
      expect(result.current).toEqual({ user: null, status: 'ready' });
    });

    test('registro exitoso sin sesión previa establece el nuevo usuario y su token sin segundo login', async () => {
      auth.refresh.mockRejectedValueOnce(new Error('sin sesion previa'));
      const { result } = renderHook(() => useSession(), { wrapper });
      await act(async () => {
        await registerSession('token-43-chars', USER.name, 'clave-segura-2026');
      });
      expect(auth.registerWithInvitation).toHaveBeenCalledWith(
        'token-43-chars',
        USER.name,
        'clave-segura-2026',
      );
      // No debe realizar una llamada extra a login
      expect(auth.login).not.toHaveBeenCalled();
      expect(result.current).toEqual({
        user: { id: USER.id, name: USER.name, role: 'ADMIN' },
        status: 'ready',
      });
      expect(getAuthHeaders()).toEqual({ Authorization: `Bearer ${token(USER.id, 1)}` });
      expect(localStorage.length).toBe(0);
      expect(sessionStorage.length).toBe(0);
    });

    test('login y registro simultáneos no comparten accidentalmente la promesa de ejecución', async () => {
      auth.refresh.mockRejectedValueOnce(new Error('sin sesion previa'));
      const loginGate = deferred<{ accessToken: string; user: typeof USER }>();
      const registerGate = deferred<{ accessToken: string; user: typeof USER }>();
      auth.login.mockReturnValueOnce(loginGate.promise);
      auth.registerWithInvitation.mockReturnValueOnce(registerGate.promise);

      const loginTask = loginSession(USER.email, 'clave-login');
      const registerTask = registerSession('token-43', USER.name, 'clave-reg');

      // No deben compartir la misma promesa
      expect(loginTask).not.toBe(registerTask);

      loginGate.resolve({ accessToken: token(USER.id, 1), user: USER });
      await loginTask;

      // El registro que esperaba detrás del login detecta la sesión activa y es rechazado
      registerGate.resolve({
        accessToken: token('otro-id', 2),
        user: { ...USER, id: 'otro-id' },
      });
      await expect(registerTask).rejects.toThrow('Ya existe una sesión activa');
    });

    test('registerSession comparte promesa de ejecución si se invoca concurrentemente (single-flight)', async () => {
      auth.refresh.mockRejectedValueOnce(new Error('sin sesion previa'));
      const gate = deferred<{ accessToken: string; user: typeof USER }>();
      auth.registerWithInvitation.mockReturnValueOnce(gate.promise);

      const first = registerSession('token-43', USER.name, 'clave');
      const second = registerSession('token-43', USER.name, 'clave');

      expect(first).toBe(second);
      gate.resolve({ accessToken: token(USER.id, 1), user: USER });
      await first;
      expect(auth.registerWithInvitation).toHaveBeenCalledTimes(1);
    });

    test('logout durante un registerSession en curso no permite que el registro tardío restablezca sesión', async () => {
      auth.refresh.mockRejectedValueOnce(new Error('sin sesion previa'));
      const gate = deferred<{ accessToken: string; user: typeof USER }>();
      auth.registerWithInvitation.mockReturnValueOnce(gate.promise);

      const registerTask = registerSession('token-43', USER.name, 'clave');
      const closing = logoutSession();

      gate.resolve({ accessToken: token(USER.id, 1), user: USER });
      await expect(registerTask).rejects.toThrow(
        'La operación fue reemplazada por otro cambio de sesión.',
      );
      await closing;

      expect(getAuthHeaders()).toEqual({});
      const { result } = renderHook(() => useSession(), { wrapper });
      expect(result.current).toEqual({ user: null, status: 'ready' });
    });

    test('registro iniciado primero y login iniciado después: login no envía HTTP hasta que termina el registro y no hay peticiones simultáneas', async () => {
      auth.refresh.mockRejectedValueOnce(new Error('sin sesion previa'));
      const registerGate = deferred<{ accessToken: string; user: typeof USER }>();
      const loginGate = deferred<{ accessToken: string; user: typeof USER }>();
      auth.registerWithInvitation.mockReturnValueOnce(registerGate.promise);
      auth.login.mockReturnValueOnce(loginGate.promise);

      const registerTask = registerSession('token-43', USER.name, 'clave-reg');
      const loginTask = loginSession('segundo@example.com', 'clave-login');

      // Las promesas son distintas
      expect(loginTask).not.toBe(registerTask);

      // El registro disparó su petición HTTP
      expect(auth.registerWithInvitation).toHaveBeenCalledTimes(1);
      // El login NO ha disparado su petición HTTP mientras el registro está en vuelo
      expect(auth.login).not.toHaveBeenCalled();

      // Completamos el registro
      registerGate.resolve({ accessToken: token(USER.id, 1), user: USER });
      await registerTask;

      // Recién tras culminar el registro, el login inicia su petición HTTP
      await waitFor(() => expect(auth.login).toHaveBeenCalledTimes(1));

      // Resolvemos el login
      const SECOND_USER = { ...USER, id: '22222222-2222-4222-8222-222222222222', email: 'segundo@example.com' };
      loginGate.resolve({ accessToken: token(SECOND_USER.id, 2), user: SECOND_USER });
      await loginTask;

      expect(getAuthHeaders()).toEqual({ Authorization: `Bearer ${token(SECOND_USER.id, 2)}` });
      const { result } = renderHook(() => useSession(), { wrapper });
      expect(result.current).toEqual({
        user: { id: SECOND_USER.id, name: SECOND_USER.name, role: 'ADMIN' },
        status: 'ready',
      });
    });

    test('registro exitoso seguido de login reemplaza correctamente la identidad y el token', async () => {
      auth.refresh.mockRejectedValueOnce(new Error('sin sesion previa'));
      const SECOND_USER = {
        id: '22222222-2222-4222-8222-222222222222',
        name: 'Grace Hopper',
        email: 'grace@example.com',
        role: 'EMPLOYEE' as const,
      };
      auth.login.mockResolvedValueOnce({
        accessToken: token(SECOND_USER.id, 9),
        user: SECOND_USER,
      });

      await registerSession('token-43', USER.name, 'clave-reg');
      expect(getAuthHeaders()).toEqual({ Authorization: `Bearer ${token(USER.id, 1)}` });

      await loginSession(SECOND_USER.email, 'password123');
      expect(getAuthHeaders()).toEqual({ Authorization: `Bearer ${token(SECOND_USER.id, 9)}` });

      const { result } = renderHook(() => useSession(), { wrapper });
      expect(result.current).toEqual({
        user: { id: SECOND_USER.id, name: SECOND_USER.name, role: 'EMPLOYEE' },
        status: 'ready',
      });
    });

    test('registro fallido seguido de login permite que el login continúe normalmente', async () => {
      auth.refresh.mockRejectedValueOnce(new Error('sin sesion previa'));
      const registerGate = deferred<{ accessToken: string; user: typeof USER }>();
      const loginGate = deferred<{ accessToken: string; user: typeof USER }>();
      auth.registerWithInvitation.mockReturnValueOnce(registerGate.promise);
      auth.login.mockReturnValueOnce(loginGate.promise);

      const registerTask = registerSession('token-invalido', USER.name, 'clave');
      const loginTask = loginSession(USER.email, 'clave-login');

      expect(auth.login).not.toHaveBeenCalled();

      // Falla el registro
      registerGate.reject(new Error('invitacion-expirada'));
      await expect(registerTask).rejects.toThrow('invitacion-expirada');

      // El login puede continuar tras el fallo del registro
      await waitFor(() => expect(auth.login).toHaveBeenCalledTimes(1));
      loginGate.resolve({ accessToken: token(USER.id, 1), user: USER });
      await loginTask;

      expect(getAuthHeaders()).toEqual({ Authorization: `Bearer ${token(USER.id, 1)}` });
      const { result } = renderHook(() => useSession(), { wrapper });
      expect(result.current).toEqual({
        user: { id: USER.id, name: USER.name, role: 'ADMIN' },
        status: 'ready',
      });
    });

    test('logout durante el registro con un login esperando detrás: ninguna operación obsoleta restablece una sesión', async () => {
      auth.refresh.mockRejectedValueOnce(new Error('sin sesion previa'));
      const registerGate = deferred<{ accessToken: string; user: typeof USER }>();
      auth.registerWithInvitation.mockReturnValueOnce(registerGate.promise);

      const registerTask = registerSession('token-43', USER.name, 'clave-reg');
      const loginTask = loginSession(USER.email, 'clave-login');

      // Logout se dispara mientras el registro está en vuelo y el login esperando detrás
      const closing = logoutSession();

      // El login nunca llegó a llamar HTTP porque el logout lo canceló tras esperar al registro
      expect(auth.login).not.toHaveBeenCalled();

      // El registro responde tarde
      registerGate.resolve({ accessToken: token(USER.id, 1), user: USER });

      // Ambas operaciones son rechazadas por ser obsoletas
      await expect(registerTask).rejects.toThrow(
        'La operación fue reemplazada por otro cambio de sesión.',
      );
      await expect(loginTask).rejects.toThrow(
        'La operación fue reemplazada por otro cambio de sesión.',
      );

      await closing;

      // El login nunca envió su HTTP POST
      expect(auth.login).not.toHaveBeenCalled();
      expect(getAuthHeaders()).toEqual({});
      const { result } = renderHook(() => useSession(), { wrapper });
      expect(result.current).toEqual({ user: null, status: 'ready' });
    });
  });

  test('una renovación mantiene el usuario y sustituye el token', async () => {
    await loginSession(USER.email, 'clave');
    expect(await refreshSession()).toBe(true);
    expect(getAuthHeaders()).toEqual({ Authorization: `Bearer ${token(USER.id, 2)}` });
    expect(auth.refresh).toHaveBeenCalledTimes(1);
  });

  test('dos 401 concurrentes comparten exactamente un refresh', async () => {
    await loginSession(USER.email, 'clave');
    const gate = deferred<{ accessToken: string; user: typeof USER }>();
    auth.refresh.mockReturnValueOnce(gate.promise);
    const first = refreshSession();
    const second = refreshSession();
    expect(first).toBe(second);
    expect(auth.refresh).toHaveBeenCalledTimes(1);
    gate.resolve({ accessToken: token(USER.id, 2), user: USER });
    expect(await first).toBe(true);
    expect(await second).toBe(true);
  });

  test('rechaza refresh de otro usuario y descarta las credenciales', async () => {
    await loginSession(USER.email, 'clave');
    auth.refresh.mockResolvedValueOnce({
      accessToken: token('usuario-distinto', 2),
      user: { ...USER, id: 'usuario-distinto' },
    });
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
    const gate = deferred<{ accessToken: string; user: typeof USER }>();
    auth.refresh.mockReturnValueOnce(gate.promise);
    const pending = refreshSession();
    const closing = logoutSession();
    expect(getAuthHeaders()).toEqual({});
    expect(auth.logout).not.toHaveBeenCalled();
    gate.resolve({ accessToken: token(USER.id, 2), user: USER });
    expect(await pending).toBe(false);
    await closing;
    expect(auth.logout).toHaveBeenCalledTimes(1);
    expect(getAuthHeaders()).toEqual({});
  });

  describe('restoreSession: restauración de sesión real (A-06.5 / A-08b)', () => {
    test('restauración exitosa recupera el usuario y token válidos', async () => {
      auth.refresh.mockResolvedValueOnce({
        accessToken: token(USER.id, 10),
        user: USER,
      });

      await restoreSession();

      expect(getAuthHeaders()).toEqual({
        Authorization: `Bearer ${token(USER.id, 10)}`,
      });
      const { result } = renderHook(() => useSession(), { wrapper });
      expect(result.current).toEqual({
        user: { id: USER.id, name: USER.name, role: 'ADMIN' },
        status: 'ready',
      });
    });

    test('restauración con 401 deja la sesión lista pero sin usuario autenticado', async () => {
      auth.refresh.mockRejectedValueOnce(new Error('401'));

      await restoreSession();

      expect(getAuthHeaders()).toEqual({});
      const { result } = renderHook(() => useSession(), { wrapper });
      expect(result.current).toEqual({ user: null, status: 'ready' });
    });

    test('restauración ante fallo de red (status 0) no bloquea la aplicación en loading', async () => {
      auth.refresh.mockRejectedValueOnce(new Error('sin red'));

      await restoreSession();

      expect(getAuthHeaders()).toEqual({});
      const { result } = renderHook(() => useSession(), { wrapper });
      expect(result.current).toEqual({ user: null, status: 'ready' });
    });

    test('restauración ante error de servidor (500/503) no bloquea la aplicación', async () => {
      auth.refresh.mockRejectedValueOnce(new Error('500'));

      await restoreSession();

      expect(getAuthHeaders()).toEqual({});
      const { result } = renderHook(() => useSession(), { wrapper });
      expect(result.current).toEqual({ user: null, status: 'ready' });
    });

    test('deduplica restauraciones concurrentes (por ejemplo, React Strict Mode)', async () => {
      const gate = deferred<{ accessToken: string; user: typeof USER }>();
      auth.refresh.mockReturnValueOnce(gate.promise);

      const first = restoreSession();
      const second = restoreSession();

      expect(first).toBe(second);
      expect(auth.refresh).toHaveBeenCalledTimes(1);

      gate.resolve({ accessToken: token(USER.id, 5), user: USER });
      await first;
      await second;

      expect(getAuthHeaders()).toEqual({
        Authorization: `Bearer ${token(USER.id, 5)}`,
      });
    });

    test('descarta respuesta de restauración si el sub del JWT no coincide con user.id', async () => {
      auth.refresh.mockResolvedValueOnce({
        accessToken: token('otro-usuario-id', 1),
        user: USER,
      });

      await restoreSession();

      expect(getAuthHeaders()).toEqual({});
      const { result } = renderHook(() => useSession(), { wrapper });
      expect(result.current).toEqual({ user: null, status: 'ready' });
    });

    test('logout durante una restauración impide que la respuesta tardía restaure sesión', async () => {
      const gate = deferred<{ accessToken: string; user: typeof USER }>();
      auth.refresh.mockReturnValueOnce(gate.promise);

      const restoringTask = restoreSession();
      const closing = logoutSession();

      expect(getAuthHeaders()).toEqual({});
      gate.resolve({ accessToken: token(USER.id, 2), user: USER });

      await restoringTask;
      await closing;

      expect(getAuthHeaders()).toEqual({});
      const { result } = renderHook(() => useSession(), { wrapper });
      expect(result.current).toEqual({ user: null, status: 'ready' });
    });

    test('restaurar no inventa identidad desde fixtures ni localStorage', async () => {
      localStorage.setItem('sim-session', USER.id);
      auth.refresh.mockRejectedValueOnce(new Error('sin cookie'));

      await restoreSession();

      expect(getAuthHeaders()).toEqual({});
      const { result } = renderHook(() => useSession(), { wrapper });
      await waitFor(() =>
        expect(result.current).toEqual({ user: null, status: 'ready' }),
      );
    });

    test('expone estado loading mientras la restauración está en curso', async () => {
      const gate = deferred<{ accessToken: string; user: typeof USER }>();
      auth.refresh.mockReturnValueOnce(gate.promise);

      const { result } = renderHook(() => useSession(), { wrapper });

      // Inmediatamente tras montar, antes de resolver el refresh, el estado es 'loading'
      expect(result.current).toEqual({ user: null, status: 'loading' });

      // Tras resolver, transiciona a ready con el usuario
      gate.resolve({ accessToken: token(USER.id, 1), user: USER });
      await waitFor(() =>
        expect(result.current).toEqual({
          user: { id: USER.id, name: USER.name, role: 'ADMIN' },
          status: 'ready',
        }),
      );
    });

    test('login ejecutado durante una restauración pendiente prevalece y descarta la respuesta tardía', async () => {
      const restoreGate = deferred<{ accessToken: string; user: typeof USER }>();
      auth.refresh.mockReturnValueOnce(restoreGate.promise);

      const SECOND_USER = {
        id: '22222222-2222-4222-8222-222222222222',
        name: 'Grace Hopper',
        email: 'grace@example.com',
        role: 'EMPLOYEE' as const,
      };

      auth.login.mockResolvedValueOnce({
        accessToken: token(SECOND_USER.id, 99),
        user: SECOND_USER,
      });

      const { result } = renderHook(() => useSession(), { wrapper });
      const restoringTask = restoreSession();
      expect(result.current.status).toBe('loading');

      // Se ejecuta login mientras restoreSession sigue esperando a restoreGate
      await act(async () => {
        await loginSession(SECOND_USER.email, 'password123');
      });

      expect(result.current).toEqual({
        user: { id: SECOND_USER.id, name: SECOND_USER.name, role: 'EMPLOYEE' },
        status: 'ready',
      });
      expect(getAuthHeaders()).toEqual({
        Authorization: `Bearer ${token(SECOND_USER.id, 99)}`,
      });

      // La respuesta tardía de la restauración original resuelve ahora
      restoreGate.resolve({ accessToken: token(USER.id, 1), user: USER });
      await act(async () => {
        await restoringTask;
      });

      // Debe mantenerse el usuario del login, la restauración tardía se descartó
      expect(result.current).toEqual({
        user: { id: SECOND_USER.id, name: SECOND_USER.name, role: 'EMPLOYEE' },
        status: 'ready',
      });
      expect(getAuthHeaders()).toEqual({
        Authorization: `Bearer ${token(SECOND_USER.id, 99)}`,
      });
    });

    test('los consumidores reciben ordenadamente las transiciones loading -> ready autenticado -> ready no autenticado', async () => {
      const history: Array<{ user: string | null; status: string }> = [];

      auth.refresh.mockRejectedValueOnce(new Error('sin sesion'));
      const { result } = renderHook(() => {
        const session = useSession();
        const current = { user: session.user?.name ?? null, status: session.status };
        const last = history.at(-1);
        if (!last || last.user !== current.user || last.status !== current.status) {
          history.push(current);
        }
        return session;
      }, { wrapper });

      // Esperar a que pase a no autenticado
      await waitFor(() => expect(result.current.status).toBe('ready'));
      expect(result.current.user).toBeNull();

      // Login exitoso
      await act(async () => {
        await loginSession(USER.email, 'clave');
      });
      expect(result.current.status).toBe('ready');
      expect(result.current.user?.name).toBe('Ada Lovelace');

      // Logout exitoso
      await act(async () => {
        await logoutSession();
      });
      expect(result.current.status).toBe('ready');
      expect(result.current.user).toBeNull();

      // Verificar que la secuencia completa de transiciones ocurrió en el orden exacto:
      // 1. Restauración inicial en curso (loading, sin usuario)
      // 2. Restauración finalizada sin sesión (ready, sin usuario)
      // 3. Login en curso (loading, sin usuario)
      // 4. Login exitoso (ready, usuario Ada Lovelace)
      // 5. Logout exitoso (ready, sin usuario)
      expect(history).toEqual([
        { user: null, status: 'loading' },
        { user: null, status: 'ready' },
        { user: null, status: 'loading' },
        { user: 'Ada Lovelace', status: 'ready' },
        { user: null, status: 'ready' },
      ]);
    });
  });
});
