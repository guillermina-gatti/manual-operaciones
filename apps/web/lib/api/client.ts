// Cliente HTTP de la API. Ningún componente usa fetch directamente.
import { ApiError } from './api-error';

// Tipo de función para obtener los encabezados de autenticación (ej. Token JWT)
export type GetAuthHeaders = () => Record<string, string>;

// Interfaz pública del cliente de API
export interface ApiClient {
  request<T>(path: string, init?: RequestInit): Promise<T>;
}

// Prefijo obligatorio: Solo se permiten URLs relativas que pasen por el proxy de Next.js
const API_PREFIX = '/api/';

// Fábrica para crear la instancia del cliente HTTP
export function createApiClient(getAuthHeaders: GetAuthHeaders): ApiClient {
  return {
    async request<T>(path: string, init: RequestInit = {}): Promise<T> {
      // Validamos que la ruta comience con '/api/'
      if (!path.startsWith(API_PREFIX)) {
        throw new Error(`Solo se puede pedir a ${API_PREFIX}…, no a "${path}"`);
      }

      // Preparamos los encabezados HTTP
      const headers = new Headers(init.headers);
      headers.set('Accept', 'application/json');

      // Inyectamos los encabezados de autenticación
      for (const [name, value] of Object.entries(getAuthHeaders())) {
        headers.set(name, value);
      }

      let response: Response;
      try {
        // Ejecutamos la petición HTTP
        response = await fetch(path, { ...init, headers });
      } catch (error) {
        // Si el usuario canceló la petición a propósito, no lo tratamos como falla de red
        if (error instanceof DOMException && error.name === 'AbortError') throw error;
        // Error de red o conexión caída (estado 0)
        throw new ApiError(0);
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
