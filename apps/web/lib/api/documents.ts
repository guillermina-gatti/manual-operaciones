// Llamadas a /api/documents (plan 002, sección 2; plan 001, sección 3).
// Los tipos copian los de apps/api/src/documents/dto/document.response.ts, con los mismos nombres.
// Compartirlos en un paquete común queda para más adelante.
import type { ApiClient } from './client';

export type DocumentStatus = 'ACTIVE' | 'ARCHIVED';
export type DocumentVersionStatus = 'CURRENT' | 'REPLACED';
export type ProcessingStatus = 'PENDING' | 'PROCESSING' | 'READY' | 'FAILED';

export interface DocumentVersionResponse {
  id: string;
  versionNumber: number;
  status: DocumentVersionStatus;
  originalFileName: string;
  mimeType: string;
  sizeBytes: number;
  processingStatus: ProcessingStatus;
  createdAt: string;
}

// Versión resumida del listado (plan 001, 3.2).
export interface DocumentVersionSummary {
  id: string;
  versionNumber: number;
  originalFileName: string;
  mimeType: string;
  processingStatus: ProcessingStatus;
}

interface DocumentFields {
  id: string;
  title: string;
  description: string | null;
  status: DocumentStatus;
  areaIds: string[];
  ownerId: string;
  // YYYY-MM-DD, sin hora: no pasar por new Date (se correría un día en Argentina).
  reviewDate: string;
  createdById: string;
  createdAt: string;
  // Cuándo se archivó, o null si está activo (spec 003, plan 1.6). La API lo manda siempre; es
  // opcional para los datos de prueba anteriores a la spec 003.
  archivedAt?: string | null;
  // Spec 005 (plan 005, 2.1): solo llega si el usuario es ADMIN o el responsable (R4). La web no
  // calcula el estado ni decide quién lo ve: usa lo que manda la API (D16).
  review?: DocumentReview;
}

// Spec 005: el estado de revisión (R1) y la última revisión (R11).
export type ReviewStatus = 'UP_TO_DATE' | 'DUE_SOON' | 'OVERDUE';

export interface DocumentReview {
  // null si el documento está archivado (R2).
  status: ReviewStatus | null;
  // null si nunca se revisó.
  lastReviewedAt: string | null;
  lastReviewedById: string | null;
}

// Detalle y respuesta 201 de la carga.
export interface DocumentResponse extends DocumentFields {
  currentVersion: DocumentVersionResponse;
}

// Cada elemento del listado.
export interface DocumentSummary extends DocumentFields {
  currentVersion: DocumentVersionSummary;
}

export interface DocumentListResponse {
  data: DocumentSummary[];
  total: number;
  page: number;
  limit: number;
}

// Spec 005: "Por revisar" (R5). isReviewer dice si mostrar el acceso aunque no haya pendientes (D19).
export interface PendingReviewResponse extends DocumentListResponse {
  isReviewer: boolean;
}

// En el backend expiresAt es un Date; en JSON llega como texto ISO.
export interface DownloadUrl {
  url: string;
  expiresAt: string;
}

export interface UploadDocumentValues {
  file: File;
  title: string;
  areaIds: string[];
  ownerId: string;
  reviewDate: string;
  description: string;
}

// Spec 003: una fila del historial (plan 003, 1.4), de la más nueva a la más vieja.
export interface VersionHistoryItem extends DocumentVersionResponse {
  uploadedById: string;
}

export interface VersionHistoryResponse {
  data: VersionHistoryItem[];
}

// Cambio de áreas: ownerId solo si el ADMIN eligió otro responsable (plan 003, 6.2).
export interface ChangeAreasValues {
  areaIds: string[];
  ownerId?: string;
}

// Versión nueva: reviewDate vacía = se conserva la fecha actual (R7b).
export interface UploadVersionValues {
  file: File;
  reviewDate: string;
}

// Spec 004 (plan 004, 1.2): el fragmento de un resultado. Texto plano; `match` marca las palabras
// encontradas, que la web resalta sin HTML (R11).
export interface SearchFragment {
  parts: { text: string; match: boolean }[];
  pageNumber: number | null;
}

// Cada resultado: lo mismo que el listado, más el fragmento (null si coincidió solo el título o la
// descripción, R8).
export interface DocumentSearchResult extends DocumentSummary {
  fragment: SearchFragment | null;
}

export interface DocumentSearchResponse {
  data: DocumentSearchResult[];
  total: number;
  page: number;
  limit: number;
}

// Documentos por página del listado (F7) y de la búsqueda (R10).
export const PAGE_SIZE = 20;

const documentPath = (id: string) => `/api/documents/${encodeURIComponent(id)}`;

export function createDocumentsApi(client: ApiClient) {
  return {
    listDocuments(page: number, signal?: AbortSignal) {
      return client.request<DocumentListResponse>(
        `/api/documents?page=${page}&limit=${PAGE_SIZE}`,
        { signal },
      );
    },

    // Spec 004: el texto va codificado; la API lo valida y lo trata como texto (R4, E10).
    searchDocuments(q: string, page: number, signal?: AbortSignal) {
      return client.request<DocumentSearchResponse>(
        `/api/documents/search?q=${encodeURIComponent(q)}&page=${page}&limit=${PAGE_SIZE}`,
        { signal },
      );
    },

    getDocument(id: string, signal?: AbortSignal) {
      return client.request<DocumentResponse>(documentPath(id), { signal });
    },

    // Se pide en el momento del clic: el enlace vence a los 5 minutos (F8).
    getDownloadUrl(id: string, signal?: AbortSignal) {
      return client.request<DownloadUrl>(`${documentPath(id)}/download`, { signal });
    },

    uploadDocument(values: UploadDocumentValues, signal?: AbortSignal) {
      const form = new FormData();
      form.append('file', values.file);
      form.append('title', values.title);
      // La API espera el campo repetido, una vez por área (plan 001, 3.1).
      for (const areaId of values.areaIds) form.append('areaIds', areaId);
      form.append('ownerId', values.ownerId);
      form.append('reviewDate', values.reviewDate);
      // La descripción es opcional: un texto vacío no se manda.
      if (values.description.trim() !== '') form.append('description', values.description);

      return client.request<DocumentResponse>('/api/documents', {
        method: 'POST',
        body: form,
        signal,
      });
    },

    // ── Ciclo de vida (spec 003, plan 6.6). Solo el ADMIN; la API responde 403 a los demás.

    changeAreas(id: string, values: ChangeAreasValues, signal?: AbortSignal) {
      const body: ChangeAreasValues = { areaIds: values.areaIds };
      if (values.ownerId !== undefined) body.ownerId = values.ownerId;

      return client.request<DocumentResponse>(`${documentPath(id)}/areas`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal,
      });
    },

    uploadVersion(id: string, values: UploadVersionValues, signal?: AbortSignal) {
      const form = new FormData();
      form.append('file', values.file);
      if (values.reviewDate !== '') form.append('reviewDate', values.reviewDate);

      return client.request<DocumentResponse>(`${documentPath(id)}/versions`, {
        method: 'POST',
        body: form,
        signal,
      });
    },

    archiveDocument(id: string, signal?: AbortSignal) {
      return client.request<DocumentResponse>(`${documentPath(id)}/archive`, {
        method: 'POST',
        signal,
      });
    },

    listVersions(id: string, signal?: AbortSignal) {
      return client.request<VersionHistoryResponse>(`${documentPath(id)}/versions`, { signal });
    },

    // Como la descarga de la vigente: se pide en cada clic (F8 del plan 002).
    getVersionDownloadUrl(id: string, versionId: string, signal?: AbortSignal) {
      return client.request<DownloadUrl>(
        `${documentPath(id)}/versions/${encodeURIComponent(versionId)}/download`,
        { signal },
      );
    },

    // ── Avisos de vencimiento (spec 005, plan 7.6).

    // Con limit=1 sirve para leer solo la cantidad y si el usuario es revisor (D18).
    listPendingReview(page: number, limit: number, signal?: AbortSignal) {
      return client.request<PendingReviewResponse>(
        `/api/documents/pending-review?page=${page}&limit=${limit}`,
        { signal },
      );
    },

    markReviewed(id: string, reviewDate: string, signal?: AbortSignal) {
      return client.request<DocumentResponse>(`${documentPath(id)}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviewDate }),
        signal,
      });
    },
  };
}
