// Único punto de entrada de la sesión. Hoy es la sesión de desarrollo, que inicia sesión de verdad con
// el usuario de prueba elegido (plan 002, sección 3.1). Cuando llegue la pantalla de login de la pareja A,
// este archivo pasa a reexportar la suya y se borran simulated-session.tsx y dev-credentials.ts.
export {
  DEV_LOGIN_ERROR,
  SessionProvider,
  SIM_SESSION_KEY,
  getAuthHeaders,
  refreshSession,
  restoreSession,
  selectDevUser,
  useDevLoginError,
  useSession,
} from './simulated-session';
export { ROLES } from './session';
export type { Role, SessionState, SessionStatus, SessionUser } from './session';
