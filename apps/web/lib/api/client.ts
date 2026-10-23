// Cliente HTTP de la API (plan 002, secciones 2 y 3.2). Ningún componente usa fetch directamente.
import { ApiError } from './api-error';

export type GetAuthHeaders = () => Record<string, string>;

export interface ApiClient {
  request<T>(path: string, init?: RequestInit): Promise<T>;
}

// Solo URLs relativas de la API: Next las reenvía al backend con el rewrite (T02).
// Nunca la dirección del backend ni S3 (spec sección 9).
const API_PREFIX = '/api/';

export function createApiClient(getAuthHeaders: GetAuthHeaders): ApiClient {
  return {
    async request<T>(path: string, init: RequestInit = {}): Promise<T> {
      if (!path.startsWith(API_PREFIX)) {
        throw new Error(`Solo se puede pedir a ${API_PREFIX}…, no a "${path}"`);
      }

      // No se fija Content-Type: con FormData, el navegador agrega el boundary del multipart.
      const headers = new Headers(init.headers);
      headers.set('Accept', 'application/json');
      for (const [name, value] of Object.entries(getAuthHeaders())) {
        headers.set(name, value);
      }

      let response: Response;
      try {
        response = await fetch(path, { ...init, headers });
      } catch (error) {
        // Una cancelación la pidió quien hizo el pedido: no es un error de conexión.
        if (error instanceof DOMException && error.name === 'AbortError') throw error;
        throw new ApiError(0);
      }

      const body = await readJson(response);
      if (body === NOT_JSON) throw new ApiError(0);

      if (!response.ok) throw toApiError(response.status, body);
      return body as T;
    },
  };
}

const NOT_JSON = Symbol('not-json');

// Una respuesta vacía (por ejemplo, un 204) se lee como undefined.
async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text === '') return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return NOT_JSON;
  }
}

// Formato de Nest: { statusCode, message (texto o arreglo), error } y, en el 409, existingDocumentId.
function toApiError(status: number, body: unknown): ApiError {
  const fields = (typeof body === 'object' && body !== null ? body : {}) as {
    message?: unknown;
    existingDocumentId?: unknown;
  };

  const raw = Array.isArray(fields.message) ? fields.message : [fields.message];
  const messages = raw.filter((m): m is string => typeof m === 'string');
  const existingDocumentId =
    typeof fields.existingDocumentId === 'string' ? fields.existingDocumentId : undefined;

  return new ApiError(status, messages, existingDocumentId);
}
