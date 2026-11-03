// A-10a.1: La sesión real es el comportamiento predeterminado de la aplicación.
// Solo se desactiva si se define explícitamente NEXT_PUBLIC_REAL_AUTH='false'.
import * as real from './real-session';
import * as simulated from './simulated-session';

export const REAL_AUTH_ENABLED = process.env.NEXT_PUBLIC_REAL_AUTH !== 'false';

export const SessionProvider = REAL_AUTH_ENABLED
  ? real.SessionProvider
  : simulated.SessionProvider;
export const useSession = REAL_AUTH_ENABLED ? real.useSession : simulated.useSession;
export const getAuthHeaders = REAL_AUTH_ENABLED
  ? real.getAuthHeaders
  : simulated.getAuthHeaders;
export const refreshSession = REAL_AUTH_ENABLED
  ? real.refreshSession
  : simulated.refreshSession;
export const restoreSession = REAL_AUTH_ENABLED
  ? real.restoreSession
  : simulated.restoreSession;

// Compatibilidad temporal con el selector de desarrollo y sus pruebas.
// Estos métodos NO son usados por el modo de autenticación real.
export {
  DEV_LOGIN_ERROR,
  SIM_SESSION_KEY,
  selectDevUser,
  useDevLoginError,
} from './simulated-session';
export { ROLES } from './session';
export type { Role, SessionState, SessionStatus, SessionUser } from './session';
