'use client';

// A-08b: estado real aislado del selector de desarrollo. A-10a activará este proveedor.
// El access token vive solamente en memoria. La cookie httpOnly la administra la API.
import { createContext, useContext, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { login, logout, refresh, registerWithInvitation } from '@/lib/auth/auth-client';
import type { SessionState, SessionUser } from './session';

const SERVER_SNAPSHOT: SessionState = { user: null, status: 'loading' };
const EMPTY_SESSION: SessionState = { user: null, status: 'ready' };

let snapshot: SessionState = SERVER_SNAPSHOT;
let accessToken: string | null = null;
let generation = 0;
let initialized = false;
let refreshing: Promise<boolean> | null = null;
let restoring: Promise<void> | null = null;
let loggingIn: Promise<SessionUser> | null = null;
let registering: Promise<SessionUser> | null = null;
let leaving: Promise<void> | null = null;
const listeners = new Set<() => void>();

function update(next: SessionState): void {
  snapshot = next;
  for (const listener of listeners) listener();
}

function tokenSubject(jwt: string): string | null {
  // No verifica la firma. Solo comprueba consistencia con el usuario que ya inició
  // sesión; la autorización efectiva siempre corresponde al backend.
  try {
    const part = jwt.split('.')[1];
    if (!part) return null;
    const { sub } = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/'))) as {
      sub?: unknown;
    };
    return typeof sub === 'string' ? sub : null;
  } catch {
    return null;
  }
}

/**
 * Restaura la sesión mediante POST /api/auth/refresh (A-06.5).
 * Deduplica llamadas concurrentes y protege contra interferencia con login/logout.
 */
export function restoreSession(): Promise<void> {
  if (restoring) return restoring;

  const currentGeneration = ++generation;
  // Iniciar la promesa de refresh sincrónicamente para evitar demoras por microtasks
  const refreshPromise = refresh();

  const task = (async (): Promise<void> => {
    // Si hay un logout en curso, esperar que termine para no revivir la sesión.
    await leaving?.catch(() => undefined);
    if (currentGeneration !== generation) return;

    try {
      const result = await refreshPromise;
      if (currentGeneration !== generation) return;

      // Validación de consistencia: el sub del JWT debe coincidir con el user.id recibido
      if (tokenSubject(result.accessToken) !== result.user.id) {
        accessToken = null;
        update(EMPTY_SESSION);
        return;
      }

      accessToken = result.accessToken;
      const user: SessionUser = {
        id: result.user.id,
        name: result.user.name,
        role: result.user.role,
      };
      update({ user, status: 'ready' });
    } catch {
      if (currentGeneration !== generation) return;
      accessToken = null;
      // Tanto ante 401 como ante fallas de red/servidor, la sesión no queda colgada
      // en 'loading' y finaliza su ciclo de inicialización.
      update(EMPTY_SESSION);
    }
  })();

  restoring = task;
  void task.finally(() => {
    initialized = true;
    if (restoring === task) restoring = null;
  }).catch(() => undefined);
  return task;
}

/** Login real. El token queda en RAM; los datos visibles provienen del backend. */
export function loginSession(email: string, password: string): Promise<SessionUser> {
  if (loggingIn) return loggingIn; // No enviar dos POST de login simultáneos.
  const task = (async (): Promise<SessionUser> => {
    // No permitir que un login se adelante a un logout o registro todavía en curso.
    if (leaving) await leaving.catch(() => undefined);
    if (registering) await registering.catch(() => undefined);
    if (leaving) {
      throw new Error('La operación fue reemplazada por otro cambio de sesión.');
    }
    const currentGeneration = ++generation;
    accessToken = null;
    update({ user: null, status: 'loading' });
    try {
      const result = await login(email, password);
      if (currentGeneration !== generation) {
        throw new Error('La operación fue reemplazada por otro cambio de sesión.');
      }
      accessToken = result.accessToken;
      const user: SessionUser = {
        id: result.user.id,
        name: result.user.name,
        role: result.user.role,
      };
      update({ user, status: 'ready' });
      return user;
    } catch (error) {
      if (currentGeneration === generation) {
        accessToken = null;
        update(EMPTY_SESSION);
      }
      throw error;
    }
  })();
  loggingIn = task;
  void task.finally(() => {
    if (loggingIn === task) loggingIn = null;
  }).catch(() => undefined);
  return task;
}

/** Registro con invitación. Establece la sesión en memoria; los datos provienen del backend. */
export function registerSession(
  token: string,
  name: string,
  password: string,
): Promise<SessionUser> {
  // Si ya existe una sesión autenticada lista, rechazar de inmediato sin modificar estado ni llamar HTTP
  if (snapshot.status === 'ready' && snapshot.user) {
    return Promise.reject(
      new Error('Ya existe una sesión activa. Debe cerrar sesión antes de registrar una nueva cuenta.'),
    );
  }

  if (registering) return registering; // No enviar dos peticiones de registro simultáneas.
  const task = (async (): Promise<SessionUser> => {
    // No permitir que un registro se adelante a un logout o login todavía en curso.
    if (leaving) await leaving.catch(() => undefined);
    if (loggingIn) await loggingIn.catch(() => undefined);

    // Re-comprobar tras esperar operaciones en vuelo
    if (snapshot.status === 'ready' && snapshot.user) {
      throw new Error('Ya existe una sesión activa. Debe cerrar sesión antes de registrar una nueva cuenta.');
    }
    if (leaving) {
      throw new Error('La operación fue reemplazada por otro cambio de sesión.');
    }

    const currentGeneration = ++generation;
    accessToken = null;
    update({ user: null, status: 'loading' });
    try {
      const result = await registerWithInvitation(token, name, password);
      if (currentGeneration !== generation) {
        throw new Error('La operación fue reemplazada por otro cambio de sesión.');
      }
      accessToken = result.accessToken;
      const user: SessionUser = {
        id: result.user.id,
        name: result.user.name,
        role: result.user.role,
      };
      update({ user, status: 'ready' });
      return user;
    } catch (error) {
      if (currentGeneration === generation) {
        accessToken = null;
        update(EMPTY_SESSION);
      }
      throw error;
    }
  })();
  registering = task;
  void task.finally(() => {
    if (registering === task) registering = null;
  }).catch(() => undefined);
  return task;
}

/** Una renovación compartida por todos los 401 concurrentes de esta pestaña. */
export function refreshSession(): Promise<boolean> {
  if (refreshing) return refreshing;
  if (!accessToken || !snapshot.user || leaving) return Promise.resolve(false);

  const currentGeneration = generation;
  const userId = snapshot.user.id;
  const task = (async (): Promise<boolean> => {
    try {
      const result = await refresh();
      if (currentGeneration !== generation) return false;
      if (tokenSubject(result.accessToken) !== userId) {
        accessToken = null;
        update(EMPTY_SESSION);
        return false;
      }
      accessToken = result.accessToken;
      // Actualiza rol o nombre si el backend devolvió cambios en la rotación
      const user: SessionUser = {
        id: result.user.id,
        name: result.user.name,
        role: result.user.role,
      };
      update({ user, status: 'ready' });
      return true;
    } catch {
      if (currentGeneration === generation) {
        accessToken = null;
        update(EMPTY_SESSION);
      }
      return false;
    }
  })();
  refreshing = task;
  void task.finally(() => {
    if (refreshing === task) refreshing = null;
  });
  return task;
}

/** Cierra la sesión local de inmediato y revoca la cookie en el servidor. */
export function logoutSession(): Promise<void> {
  if (leaving) return leaving;
  generation += 1;
  accessToken = null;
  update(EMPTY_SESSION);
  const loginPending = loggingIn;
  const registerPending = registering;
  const refreshPending = refreshing;
  const restorePending = restoring;
  const task = (async (): Promise<void> => {
    // Si ya había una solicitud iniciada, esperar que termine antes de revocar
    // para impedir que una respuesta tardía deje una cookie nueva tras el logout.
    await loginPending?.catch(() => undefined);
    await registerPending?.catch(() => undefined);
    await refreshPending?.catch(() => undefined);
    await restorePending?.catch(() => undefined);
    await logout();
  })();
  leaving = task;
  void task.finally(() => {
    if (leaving === task) leaving = null;
  }).catch(() => undefined);
  return task;
}

/** Cabeceras que consumirá lib/api/index.ts al activar el proveedor en A-10a. */
export function getAuthHeaders(): Record<string, string> {
  return accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
}

/** Permite a los tests restablecer el estado del módulo. */
export function __resetSessionForTests(): void {
  snapshot = SERVER_SNAPSHOT;
  accessToken = null;
  generation = 0;
  initialized = false;
  refreshing = null;
  restoring = null;
  loggingIn = null;
  registering = null;
  leaving = null;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (!initialized) void restoreSession();
  return () => listeners.delete(listener);
}

const SessionContext = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const current = useSyncExternalStore(subscribe, () => snapshot, () => SERVER_SNAPSHOT);
  return <SessionContext.Provider value={current}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionState {
  const session = useContext(SessionContext);
  if (!session) throw new Error('useSession debe usarse dentro de SessionProvider');
  return session;
}
