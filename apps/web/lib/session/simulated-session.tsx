'use client';

// Sesión simulada hasta que llegue la de la pareja A (plan 002, sección 3.1; D2).
// El usuario de prueba elegido se guarda en localStorage. En producción queda desactivada:
// nunca hay usuario ni cabeceras, así que la API responde 401.
import { createContext, useContext, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { FIXTURE_USERS } from '@/lib/directory/fixtures';
import type { SessionState, SessionUser } from './session';

export const SIM_SESSION_KEY = 'sim-session';

// Se dispara al cambiar sim-session en esta misma pestaña (el evento 'storage' solo llega a las otras).
export const SIM_SESSION_CHANGE_EVENT = 'sim-session-change';

const isProduction = () => process.env.NODE_ENV === 'production';

// Un objeto fijo por usuario, para que useSession no devuelva uno nuevo en cada render.
const USERS_BY_ID = new Map<string, SessionUser>(
  Object.values(FIXTURE_USERS).map(({ id, name, role }) => [id, { id, name, role }]),
);

function readStoredId(): string | null {
  try {
    return localStorage.getItem(SIM_SESSION_KEY);
  } catch {
    // Sin acceso a localStorage (modo privado o bloqueado): sin sesión.
    return null;
  }
}

function currentUser(): SessionUser | null {
  if (isProduction()) return null;
  const id = readStoredId();
  return id ? (USERS_BY_ID.get(id) ?? null) : null;
}

export function getAuthHeaders(): Record<string, string> {
  const user = currentUser();
  return user ? { 'x-user-id': user.id, 'x-user-role': user.role } : {};
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener('storage', onChange);
  window.addEventListener(SIM_SESSION_CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener('storage', onChange);
    window.removeEventListener(SIM_SESSION_CHANGE_EVENT, onChange);
  };
}

// undefined = todavía no se leyó (render en el servidor, donde no hay localStorage).
const getServerSnapshot = (): SessionUser | null | undefined => undefined;

const SessionContext = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const user = useSyncExternalStore(subscribe, currentUser, getServerSnapshot);

  let state: SessionState;
  if (isProduction()) state = { user: null, status: 'disabled' };
  else if (user === undefined) state = { user: null, status: 'loading' };
  else state = { user, status: 'ready' };

  return <SessionContext.Provider value={state}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionState {
  const state = useContext(SessionContext);
  if (!state) throw new Error('useSession tiene que usarse dentro de SessionProvider');
  return state;
}
