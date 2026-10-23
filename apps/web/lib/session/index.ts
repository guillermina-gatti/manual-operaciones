// Único punto de entrada de la sesión. Cuando llegue la sesión real de la pareja A,
// este archivo pasa a reexportar la suya y se borra simulated-session.tsx (plan 002, sección 3.1).
export {
  SessionProvider,
  SIM_SESSION_CHANGE_EVENT,
  SIM_SESSION_KEY,
  getAuthHeaders,
  useSession,
} from './simulated-session';
export { ROLES } from './session';
export type { Role, SessionState, SessionStatus, SessionUser } from './session';
