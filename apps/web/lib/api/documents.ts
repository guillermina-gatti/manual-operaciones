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

// Documentos por página del listado (F7).
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
  };
}
