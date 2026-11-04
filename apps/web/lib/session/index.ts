// A-10a.2: La sesión real es el comportamiento predeterminado y obligatoria en producción.
// En producción, ninguna variable pública puede activar la sesión simulada ni se compila código de desarrollo.
// En desarrollo/tests, solo se activa la sesión simulada si se especifica explícitamente NEXT_PUBLIC_REAL_AUTH='false'.
import * as real from './real-session';

export const REAL_AUTH_ENABLED =
  process.env.NODE_ENV === 'production' || process.env.NEXT_PUBLIC_REAL_AUTH !== 'false';

// En producción, el compilador elimina esta rama y no incluye simulated-session en el bundle.
let simulated: typeof import('./simulated-session') | null = null;
if (process.env.NODE_ENV !== 'production' && !REAL_AUTH_ENABLED) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  simulated = require('./simulated-session');
}

export const SessionProvider = simulated && !REAL_AUTH_ENABLED
  ? simulated.SessionProvider
  : real.SessionProvider;
export const useSession = simulated && !REAL_AUTH_ENABLED
  ? simulated.useSession
  : real.useSession;
export const getAuthHeaders = simulated && !REAL_AUTH_ENABLED
  ? simulated.getAuthHeaders
  : real.getAuthHeaders;
export const refreshSession = simulated && !REAL_AUTH_ENABLED
  ? simulated.refreshSession
  : real.refreshSession;
export const restoreSession = simulated && !REAL_AUTH_ENABLED
  ? simulated.restoreSession
  : real.restoreSession;

export { ROLES } from './session';
export type { Role, SessionState, SessionStatus, SessionUser } from './session';
export { DEFAULT_REDIRECT, buildLoginReturnUrl, sanitizeReturnTo } from './safe-redirect';
