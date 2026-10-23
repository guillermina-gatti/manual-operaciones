// Único punto de entrada de lib/api: los componentes importan de '@/lib/api', nunca de un archivo interno.
import { getAuthHeaders } from '@/lib/session';
import { createApiClient } from './client';

// El cliente que usan las pantallas: cada pedido lleva las cabeceras de la sesión.
export const apiClient = createApiClient(getAuthHeaders);

export { ApiError } from './api-error';
export { createApiClient } from './client';
export type { ApiClient, GetAuthHeaders } from './client';
export { describeApiError } from './error-messages';
export type { ErrorContext, ErrorDescription, UploadField } from './error-messages';
