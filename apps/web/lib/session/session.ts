// Forma de la sesión que usa la web (plan 002, sección 3.1). La simulada y la real de la pareja A la cumplen.
export const ROLES = ['ADMIN', 'SUPERVISOR', 'EMPLOYEE'] as const;
export type Role = (typeof ROLES)[number];

export interface SessionUser {
  id: string;
  name: string;
  role: Role;
}

// loading: todavía no se sabe quién es (por ejemplo, durante el render en el servidor).
// disabled: la sesión simulada en producción, donde nunca hay usuario.
export type SessionStatus = 'loading' | 'ready' | 'disabled';

export interface SessionState {
  user: SessionUser | null;
  status: SessionStatus;
}
