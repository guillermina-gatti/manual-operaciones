// A-08a: peticiones de autenticación HTTP, independientes del SessionProvider.
// Usa las rutas relativas /api/auth/... para pasar por el rewrite de Next.js.
// No guarda tokens en localStorage, sessionStorage ni cookies accesibles desde JS.
import { ROLES } from '../session/session';
import type { Role } from '../session/session';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
}

export interface LoginResponse {
  accessToken: string;
  user: AuthUser;
}

// Contrato actualmente implementado en develop: el refresh solo devuelve accessToken.
// A-06.5 propone ampliarlo; no anticipamos esa modificación en esta microtarea.
export interface RefreshResponse {
  accessToken: string;
}

export interface LogoutResponse {
  revoked: boolean;
}

type AuthAction = 'login' | 'refresh' | 'logout';

export class AuthClientError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'AuthClientError';
  }
}

function safeMessage(status: number, action: AuthAction): string {
  switch (status) {
    case 0:
      return 'No pudimos conectarnos. Revisá tu conexión e intentá nuevamente.';
    case 400:
      return 'Revisá los datos ingresados.';
    case 401:
      return action === 'login'
        ? 'Correo o contraseña incorrectos.'
        : 'La sesión venció. Volvé a iniciar sesión.';
    case 429:
      return 'Demasiados intentos. Probá nuevamente más tarde.';
    case 503:
      return 'El servicio no está disponible temporalmente.';
    default:
      return 'No pudimos completar la operación. Intentá nuevamente.';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isAuthUser(value: unknown): value is AuthUser {
  if (!isRecord(value)) return false;
  return (
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.name) &&
    isNonEmptyString(value.email) &&
    typeof value.role === 'string' &&
    ROLES.includes(value.role as Role)
  );
}

async function postAuth(
  action: AuthAction,
  body?: { email: string; password: string },
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(`/api/auth/${action}`, {
      method: 'POST',
      credentials: 'same-origin', // La API maneja la cookie httpOnly de refresh.
      headers: body
        ? { Accept: 'application/json', 'Content-Type': 'application/json' }
        : { Accept: 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch (error: unknown) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new AuthClientError(0, safeMessage(0, action));
  }

  // Nunca mostrar al usuario mensajes del servidor que podrían contener información interna.
  if (!response.ok) {
    throw new AuthClientError(response.status, safeMessage(response.status, action));
  }

  try {
    return await response.json();
  } catch {
    throw new AuthClientError(0, 'La respuesta del servidor no es válida.');
  }
}

/** Inicia sesión y devuelve los datos auténticos del usuario; no almacena el JWT. */
export async function login(email: string, password: string): Promise<LoginResponse> {
  const response = await postAuth('login', { email, password });
  if (
    !isRecord(response) ||
    !isNonEmptyString(response.accessToken) ||
    !isAuthUser(response.user)
  ) {
    throw new AuthClientError(0, 'La respuesta del servidor no es válida.');
  }
  return { accessToken: response.accessToken, user: response.user };
}

/** Rota la cookie y devuelve el JWT nuevo. A-08b serializará llamadas concurrentes. */
export async function refresh(): Promise<RefreshResponse> {
  const response = await postAuth('refresh');
  if (!isRecord(response) || !isNonEmptyString(response.accessToken)) {
    throw new AuthClientError(0, 'La respuesta del servidor no es válida.');
  }
  return { accessToken: response.accessToken };
}

/** Revoca la sesión del servidor; la limpieza del estado local corresponde a A-08b. */
export async function logout(): Promise<LogoutResponse> {
  const response = await postAuth('logout');
  if (!isRecord(response) || typeof response.revoked !== 'boolean') {
    throw new AuthClientError(0, 'La respuesta del servidor no es válida.');
  }
  return { revoked: response.revoked };
}
