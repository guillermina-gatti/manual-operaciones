// Único punto de entrada de lib/api: los componentes importan de '@/lib/api', nunca de un archivo interno.
export { ApiError } from './api-error';
export { createApiClient } from './client';
export type { ApiClient, GetAuthHeaders } from './client';
