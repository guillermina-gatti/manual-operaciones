// Único punto de entrada de lib/api: los componentes importan de '@/lib/api', nunca de un archivo interno.
import { getAuthHeaders } from '@/lib/session';
import { createApiClient } from './client';
import { createDocumentsApi } from './documents';

// El cliente que usan las pantallas: cada pedido lleva las cabeceras de la sesión.
export const apiClient = createApiClient(getAuthHeaders);

// Las llamadas a /api/documents, con ese cliente.
export const {
  listDocuments,
  searchDocuments,
  getDocument,
  getDownloadUrl,
  uploadDocument,
  changeAreas,
  uploadVersion,
  archiveDocument,
  listVersions,
  getVersionDownloadUrl,
} = createDocumentsApi(apiClient);
export { PAGE_SIZE } from './documents';
export type {
  ChangeAreasValues,
  DocumentListResponse,
  DocumentResponse,
  DocumentSearchResponse,
  DocumentSearchResult,
  DocumentStatus,
  DocumentSummary,
  DocumentVersionResponse,
  DocumentVersionStatus,
  DocumentVersionSummary,
  DownloadUrl,
  ProcessingStatus,
  SearchFragment,
  UploadDocumentValues,
  UploadVersionValues,
  VersionHistoryItem,
  VersionHistoryResponse,
} from './documents';

export { ApiError } from './api-error';
export { createApiClient } from './client';
export type { ApiClient, GetAuthHeaders } from './client';
export { describeApiError } from './error-messages';
export type { ErrorContext, ErrorDescription, UploadField } from './error-messages';
export { useApiResource } from './use-api-resource';
export type { ApiResource, ResourceState } from './use-api-resource';
