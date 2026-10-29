'use client';

// Sesión de desarrollo (plan 002, sección 3.1; D2). Lo único simulado es la pantalla de login: al elegir
// un usuario de prueba en DevSessionSwitcher se inicia sesión de verdad con POST /api/auth/login (su email
// y la contraseña de desarrollo, dev-credentials.ts). El accessToken queda solo en memoria; en localStorage
// se guarda únicamente el ID del usuario elegido (sim-session), para volver a entrar al recargar. El
// refresh token lo maneja la API en una cookie httpOnly. En producción queda desactivada: nunca hay
// usuario ni cabeceras, así que la API responde 401.
import { createContext, useContext, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { FIXTURE_USERS } from '@/lib/directory/fixtures';
import { DEV_FIXTURE_PASSWORD, devEmail } from './dev-credentials';
import { ROLES } from './session';
import type { Role, SessionState, SessionUser } from './session';

export const SIM_SESSION_KEY = 'sim-session';

export const DEV_LOGIN_ERROR =
  'No se pudo iniciar sesión. ¿Está levantada la API y cargado el seed de desarrollo?';

const isProduction = () => process.env.NODE_ENV === 'production';

interface DevSessionSnapshot {
  user: SessionUser | null;
  // loading: iniciando sesión, o todavía sin leer sim-session.
  status: 'loading' | 'ready';
  // El aviso del último login fallido, para el selector.
  error: string | null;
}

let snapshot: DevSessionSnapshot = { user: null, status: 'loading', error: null };
let accessToken: string | null = null;
// Cada cambio de usuario suma uno: la respuesta de un login viejo no pisa a la del último elegido.
let generation = 0;
let refreshing: Promise<boolean> | null = null;
const listeners = new Set<() => void>();

function update(next: Partial<DevSessionSnapshot>) {
  snapshot = { ...snapshot, ...next };
  for (const listener of listeners) listener();
}

function readStoredId(): string | null {
  try {
    return localStorage.getItem(SIM_SESSION_KEY);
  } catch {
    // Sin acceso a localStorage (modo privado o bloqueado): sin sesión.
    return null;
  }
}

function storeId(id: string | null) {
  try {
    if (id) localStorage.setItem(SIM_SESSION_KEY, id);
    else localStorage.removeItem(SIM_SESSION_KEY);
  } catch {
    // Sin acceso a localStorage: la sesión sigue en memoria hasta recargar.
  }
}

// Los pedidos a /api/auth van con fetch y no con apiClient: apiClient depende de esta sesión.
async function postAuth(path: string, body?: object): Promise<unknown> {
  const response = await fetch(path, {
    method: 'POST',
    headers: body
      ? { Accept: 'application/json', 'Content-Type': 'application/json' }
      : { Accept: 'application/json' },
    body: body && JSON.stringify(body),
    credentials: 'same-origin',
  });
  if (!response.ok) throw new Error(`${path} respondió ${response.status}`);
  return response.json();
}

// El `sub` del payload del JWT. No se verifica la firma: solo sirve para saber de quién es el token
// que dio /api/auth/refresh. Quien decide es la API, que sí lo verifica en cada pedido.
function tokenSubject(token: string): string | null {
  try {
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const { sub } = JSON.parse(atob(payload)) as { sub?: unknown };
    return typeof sub === 'string' ? sub : null;
  } catch {
    return null;
  }
}

async function requestRefresh(): Promise<string | null> {
  try {
    const body = (await postAuth('/api/auth/refresh')) as { accessToken?: unknown };
    return typeof body.accessToken === 'string' ? body.accessToken : null;
  } catch {
    return null;
  }
}

async function requestLogin(id: string): Promise<{ token: string; user: SessionUser } | null> {
  try {
    const body = (await postAuth('/api/auth/login', {
      email: devEmail(id),
      password: DEV_FIXTURE_PASSWORD,
    })) as { accessToken?: unknown; user?: { id?: unknown; name?: unknown; role?: unknown } };
    const { accessToken: token, user } = body;
    if (
      typeof token !== 'string' ||
      user?.id !== id ||
      typeof user.name !== 'string' ||
      !ROLES.includes(user.role as Role)
    ) {
      return null;
    }
    return { token, user: { id, name: user.name, role: user.role as Role } };
  } catch {
    return null;
  }
}

// Entra como el usuario `id`. Si `tryRefresh`, primero intenta seguir con la cookie que ya tiene el
// navegador (al recargar la página), y solo si es de otro usuario o venció, inicia sesión de nuevo.
async function enter(id: string, gen: number, tryRefresh: boolean): Promise<void> {
  if (tryRefresh) {
    const token = await requestRefresh();
    if (gen !== generation) return;
    const fixture = Object.values(FIXTURE_USERS).find((user) => user.id === id);
    if (token && fixture && tokenSubject(token) === id) {
      accessToken = token;
      update({ user: { id, name: fixture.name, role: fixture.role }, status: 'ready', error: null });
      return;
    }
  }

  const result = await requestLogin(id);
  if (gen !== generation) return;
  accessToken = result?.token ?? null;
  update(
    result
      ? { user: result.user, status: 'ready', error: null }
      : { user: null, status: 'ready', error: DEV_LOGIN_ERROR },
  );
}

// Lee sim-session y entra como ese usuario. Corre al cargar la página y cuando otra pestaña cambia
// sim-session. Exportada para los tests, que la usan para empezar cada uno desde cero.
export async function restoreSession(): Promise<void> {
  const gen = ++generation;
  accessToken = null;
  if (isProduction()) return;

  const id = readStoredId();
  if (!id || !devEmail(id)) {
    update({ user: null, status: 'ready', error: null });
    return;
  }
  update({ user: null, status: 'loading', error: null });
  await enter(id, gen, true);
}

// Lo que hace DevSessionSwitcher: con un ID, cierra la sesión anterior (si había) e inicia la del
// usuario elegido; con null ("Sin sesión"), cierra la sesión.
export async function selectDevUser(id: string | null): Promise<void> {
  if (isProduction()) return;
  const gen = ++generation;
  const hadSession = accessToken !== null;
  accessToken = null;
  storeId(id);

  if (!id || !devEmail(id)) {
    update({ user: null, status: 'ready', error: null });
    // Siempre: así la API revoca la sesión y borra la cookie aunque el token ya no esté en memoria.
    await postAuth('/api/auth/logout').catch(() => undefined);
    return;
  }

  update({ user: null, status: 'loading', error: null });
  if (hadSession) await postAuth('/api/auth/logout').catch(() => undefined);
  if (gen !== generation) return;
  await enter(id, gen, false);
}

// Para apiClient, cuando un pedido con token da 401 (token vencido): renueva una vez con la cookie.
// Si hay varios 401 a la vez, comparten el mismo refresh: la API rota el refresh token en cada uso y
// trata como robo que se presente uno ya rotado. Si no se puede renovar, la sesión termina.
export function refreshSession(): Promise<boolean> {
  if (isProduction() || !accessToken || !snapshot.user) return Promise.resolve(false);
  refreshing ??= (async () => {
    const gen = generation;
    const userId = snapshot.user?.id;
    try {
      const token = await requestRefresh();
      if (gen !== generation) return false;
      if (token && tokenSubject(token) === userId) {
        accessToken = token;
        return true;
      }
      accessToken = null;
      update({ user: null, status: 'ready', error: null });
      return false;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

export function getAuthHeaders(): Record<string, string> {
  if (isProduction() || !accessToken) return {};
  return { Authorization: `Bearer ${accessToken}` };
}

function onStorage(event: StorageEvent) {
  if (event.key === SIM_SESSION_KEY || event.key === null) void restoreSession();
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  if (listeners.size === 1) window.addEventListener('storage', onStorage);
  // La primera vez que se monta en el navegador: entra como el usuario guardado.
  if (generation === 0) void restoreSession();
  return () => {
    listeners.delete(onChange);
    if (listeners.size === 0) window.removeEventListener('storage', onStorage);
  };
}

const getSnapshot = () => snapshot;
// undefined = todavía no se leyó (render en el servidor, donde no hay localStorage).
const getServerSnapshot = (): DevSessionSnapshot | undefined => undefined;

const SessionContext = createContext<SessionState | null>(null);
const DevErrorContext = createContext<string | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const current = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  let state: SessionState;
  if (isProduction()) state = { user: null, status: 'disabled' };
  else if (current === undefined) state = { user: null, status: 'loading' };
  else state = { user: current.user, status: current.status };

  return (
    <SessionContext.Provider value={state}>
      <DevErrorContext.Provider value={current?.error ?? null}>{children}</DevErrorContext.Provider>
    </SessionContext.Provider>
  );
}

export function useSession(): SessionState {
  const state = useContext(SessionContext);
  if (!state) throw new Error('useSession tiene que usarse dentro de SessionProvider');
  return state;
}

// El aviso del último login fallido; solo lo muestra DevSessionSwitcher.
export function useDevLoginError(): string | null {
  return useContext(DevErrorContext);
}
