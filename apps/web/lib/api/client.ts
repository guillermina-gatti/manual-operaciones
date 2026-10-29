// Cliente HTTP de la API. Ningún componente usa fetch directamente.
import { ApiError } from './api-error';

// Tipo de función para obtener los encabezados de autenticación (ej. Token JWT)
export type GetAuthHeaders = () => Record<string, string>;

// Renueva el token después de un 401 (plan 002, sección 3.1). Devuelve si se pudo renovar.
export type RefreshAuth = () => Promise<boolean>;

// Interfaz pública del cliente de API
export interface ApiClient {
  request<T>(path: string, init?: RequestInit): Promise<T>;
}

// Prefijo obligatorio: Solo se permiten URLs relativas que pasen por el proxy de Next.js
const API_PREFIX = '/api/';

// Fábrica para crear la instancia del cliente HTTP
export function createApiClient(
  getAuthHeaders: GetAuthHeaders,
  refreshAuth?: RefreshAuth,
): ApiClient {
  // Hace la petición con los encabezados de autenticación del momento. Dice si llevaba alguno.
  async function send(path: string, init: RequestInit) {
    // Preparamos los encabezados HTTP
    const headers = new Headers(init.headers);
    headers.set('Accept', 'application/json');

    // Inyectamos los encabezados de autenticación
    const authHeaders = Object.entries(getAuthHeaders());
    for (const [name, value] of authHeaders) {
      headers.set(name, value);
    }

    try {
      // Ejecutamos la petición HTTP
      return { response: await fetch(path, { ...init, headers }), authenticated: authHeaders.length > 0 };
    } catch (error) {
      // Si el usuario canceló la petición a propósito, no lo tratamos como falla de red
      if (error instanceof DOMException && error.name === 'AbortError') throw error;
      // Error de red o conexión caída (estado 0)
      throw new ApiError(0);
    }
  }

  return {
    async request<T>(path: string, init: RequestInit = {}): Promise<T> {
      // Validamos que la ruta comience con '/api/'
      if (!path.startsWith(API_PREFIX)) {
        throw new Error(`Solo se puede pedir a ${API_PREFIX}…, no a "${path}"`);
      }

      const first = await send(path, init);
      let response = first.response;

      // Un 401 con sesión es un token vencido: se renueva una sola vez y se repite el pedido.
      // Sin sesión no se intenta: el 401 es el esperado.
      if (response.status === 401 && first.authenticated && refreshAuth) {
        const refreshed = await refreshAuth().catch(() => false);
        if (refreshed) response = (await send(path, init)).response;
      }

      // Intentamos parsear la respuesta como JSON
      const body = await readJson(response);
      if (body === NOT_JSON) throw new ApiError(0);

      // Si el servidor devolvió un código de error (4xx o 5xx), lanzamos el ApiError procesado
      if (!response.ok) throw toApiError(response.status, body);

      return body as T;
    },
  };
}

const NOT_JSON = Symbol('not-json');

// Función auxiliar para leer el cuerpo de la respuesta como JSON o manejar respuestas vacías
async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text === '') return undefined; // Respuestas vacías (ej. 204 No Content)
  try {
    return JSON.parse(text);
  } catch {
    return NOT_JSON; // Si no es un JSON válido
  }
}

// Procesa la estructura de error estándar de NestJS y extrae los mensajes y datos adicionales
// (existingDocumentId y reason en los 409)
function toApiError(status: number, body: unknown): ApiError {
  const fields = (typeof body === 'object' && body !== null ? body : {}) as {
    message?: unknown;
    existingDocumentId?: unknown;
    reason?: unknown;
  };

  const raw = Array.isArray(fields.message) ? fields.message : [fields.message];
  const messages = raw.filter((m): m is string => typeof m === 'string');
  const existingDocumentId =
    typeof fields.existingDocumentId === 'string' ? fields.existingDocumentId : undefined;

  const reason = typeof fields.reason === 'string' ? fields.reason : undefined;

  return new ApiError(status, messages, existingDocumentId, reason);
}
