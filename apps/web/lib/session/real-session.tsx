'use client';

// A-08b: estado real aislado del selector de desarrollo. A-10a activará este proveedor.
// El access token vive solamente en memoria. La cookie httpOnly la administra la API.
// IMPORTANTE: no se restaura identidad tras recargar hasta que A-06.5 se implemente
// en el backend: el refresh actual devuelve solo { accessToken }, no el usuario.
import { createContext, useContext, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { login, logout, refresh } from '@/lib/auth/auth-client';
import type { SessionState, SessionUser } from './session';

const SERVER_SNAPSHOT: SessionState = { user: null, status: 'loading' };
const EMPTY_SESSION: SessionState = { user: null, status: 'ready' };

let snapshot: SessionState = SERVER_SNAPSHOT;
let accessToken: string | null = null;
let generation = 0;
let initialized = false;
let refreshing: Promise<boolean> | null = null;
let entering: Promise<SessionUser> | null = null;
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
 * Estado inicial conservador: sin guardar usuario en localStorage ni leer fixtures.
 * A-06.5 deberá proveer {accessToken,user} en refresh para restaurar al recargar.
 */
export async function restoreSession(): Promise<void> {
  generation += 1;
  accessToken = null;
  initialized = true;
  update(EMPTY_SESSION);
}

/** Login real. El token queda en RAM; los datos visibles provienen del backend. */
export function loginSession(email: string, password: string): Promise<SessionUser> {
  if (entering) return entering; // No enviar dos POST de login simultáneos.
  const task = (async (): Promise<SessionUser> => {
    // No permitir que un login se adelante a un logout todavía en curso.
    await leaving?.catch(() => undefined);
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
  entering = task;
  void task.finally(() => {
    if (entering === task) entering = null;
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
  const loginPending = entering;
  const refreshPending = refreshing;
  const task = (async (): Promise<void> => {
    // Si ya había una solicitud iniciada, esperar que termine antes de revocar
    // para impedir que una respuesta tardía deje una cookie nueva tras el logout.
    await loginPending?.catch(() => undefined);
    await refreshPending?.catch(() => undefined);
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
