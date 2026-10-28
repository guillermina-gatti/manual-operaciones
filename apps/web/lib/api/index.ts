// Único punto de entrada de lib/api: los componentes importan de '@/lib/api', nunca de un archivo interno.
import { getAuthHeaders } from '@/lib/session';
import { createApiClient } from './client';
import { createDocumentsApi } from './documents';
import { createExecutionsApi } from './executions';
import { createMetricsApi } from './metrics';

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

// HU12 (spec 005): the calls to /api/executions, with the same client.
export const { startExecution, getExecution, completeStep } = createExecutionsApi(apiClient);
export type { ExecutionResponse, ExecutionStatus, ExecutionStepResponse } from './executions';
export { describeExecutionError, EXECUTION_MESSAGES } from './execution-errors';
export type { ExecutionErrorContext, ExecutionErrorDescription } from './execution-errors';

// HU38: the calls to /api/metrics/procedures, with the same client.
export const { getProcedureMetrics } = createMetricsApi(apiClient);
export { metricsQuery } from './metrics';
export type {
  ExecutionCounts,
  MetricsFilters,
  ProcedureMetricsResponse,
  ProceduresMetricsResponse,
  StepMetricsResponse,
  VersionMetricsResponse,
} from './metrics';
export { describeMetricsError, METRICS_MESSAGES } from './metrics-errors';
export type { MetricsErrorDescription } from './metrics-errors';
