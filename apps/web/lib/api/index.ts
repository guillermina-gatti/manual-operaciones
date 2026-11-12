// Único punto de entrada de lib/api: los componentes importan de '@/lib/api', nunca de un archivo interno.
import { getAuthHeaders, refreshSession } from '@/lib/session';
import { createChatApi } from './chat';
import { createChatFeedbackApi } from './chat-feedback';
import { createConflictAlertsApi } from './conflict-alerts';
import { createApiClient } from './client';
import { createDocumentsApi } from './documents';
import { createExecutionsApi } from './executions';
import { createInvitationsApi } from './invitations';
import { createMetricsApi } from './metrics';
import { createMyMetricsApi } from './my-metrics';

// El cliente que usan las pantallas: cada pedido lleva el Bearer de la sesión y, si el token
// venció (401), se renueva una vez y se repite.
export const apiClient = createApiClient(getAuthHeaders, refreshSession);

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
  listPendingReview,
  markReviewed,
} = createDocumentsApi(apiClient);
export { PAGE_SIZE } from './documents';
export type {
  ChangeAreasValues,
  DocumentListResponse,
  DocumentReference,
  DocumentResponse,
  DocumentReview,
  DocumentSearchResponse,
  DocumentSearchResult,
  DocumentStatus,
  DocumentSummary,
  DocumentVersionResponse,
  DocumentVersionStatus,
  DocumentVersionSummary,
  DownloadUrl,
  PendingReviewResponse,
  ProcessingStatus,
  ReviewStatus,
  SearchFragment,
  UploadDocumentValues,
  UploadVersionValues,
  VersionHistoryItem,
  VersionHistoryResponse,
} from './documents';

export { ApiError } from './api-error';
export { createApiClient } from './client';
export type { ApiClient, GetAuthHeaders, RefreshAuth, StreamingApiClient } from './client';
export { describeApiError } from './error-messages';
export type { ErrorContext, ErrorDescription, UploadField } from './error-messages';
export { useApiResource } from './use-api-resource';
export type { ApiResource, ResourceState } from './use-api-resource';

// HU12 (spec 005): the calls to /api/executions, with the same client.
export const { startExecution, getExecution, completeStep } = createExecutionsApi(apiClient);
export type { ExecutionResponse, ExecutionStatus, ExecutionStepResponse } from './executions';
export { describeExecutionError, EXECUTION_MESSAGES } from './execution-errors';
export type { ExecutionErrorContext, ExecutionErrorDescription } from './execution-errors';
// HU33: restarting an execution on the current version of its procedure.
export const { restartExecution } = createExecutionsApi(apiClient);
export type { PublishedChangeResponse, VersionChangeResponse } from './executions';

// HU38: the calls to /api/metrics/procedures, with the same client.
export const { getProcedureMetrics } = createMetricsApi(apiClient);
export { metricsQuery } from './metrics';
export type {
  AreaSummaryResponse,
  ExecutionCounts,
  MetricsFilters,
  ProcedureMetricsResponse,
  ProceduresMetricsResponse,
  StepMetricsResponse,
  VersionMetricsResponse,
} from './metrics';
export { describeMetricsError, METRICS_MESSAGES } from './metrics-errors';
export type { MetricsErrorDescription } from './metrics-errors';

// The employee's own activity: GET /api/metrics/me, with the same client.
export const { getMyMetrics } = createMyMetricsApi(apiClient);
export type {
  MyMetricsResponse,
  MyMetricsTotals,
  MyProcedureMetrics,
  MyResumeItem,
} from './my-metrics';
export { describeMyMetricsError, MY_METRICS_MESSAGES } from './metrics-errors';

// Spec 009 (HU20): POST /api/chat/stream, con el mismo cliente.
export const { askStream } = createChatApi(apiClient);
export { ChatStreamError } from './chat';
export type { ChatRequestBody, ChatResult, ChatResultStatus, ChatSource, ChatStreamDone, NearestDocument } from './chat';

// HU25: POST /api/chat/messages/:id/feedback, con el mismo cliente.
export const { recordFeedback } = createChatFeedbackApi(apiClient);
export type { ChatFeedbackBody } from './chat-feedback';

// Spec 011 (HU39): las alertas de documentos contradictorios, con el mismo cliente.
export const { listConflictAlerts, resolveConflictAlert } = createConflictAlertsApi(apiClient);
export { CONFLICT_ALERTS_CHANGED_EVENT, notifyConflictAlertsChanged } from './conflict-alerts';
export type { ConflictAlert, ConflictAlertDocument, ConflictAlertPage, ConflictAlertStatus } from './conflict-alerts';

// HU29: Emisión y gestión de invitaciones por administradores.
export const { createInvitation, listInvitations, revokeInvitation } =
  createInvitationsApi(apiClient);
export { INVITATIONS_CHANGED_EVENT, notifyInvitationsChanged } from './invitations';
export type {
  CreateInvitationPayload,
  CreatedInvitation,
  InvitationListItem,
  InvitationStatus,
} from './invitations';