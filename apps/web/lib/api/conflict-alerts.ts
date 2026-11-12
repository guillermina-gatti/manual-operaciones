// Spec 011 (HU39): las llamadas a /api/conflict-alerts. Los tipos son los de la API
// (apps/api/src/documents/conflict-alerts/dto/conflict-alert.response.ts), copiados como el resto de lib/api.
import type { ApiClient } from './client';
import type { DocumentReference, DocumentStatus } from './documents';

export type ConflictAlertStatus = 'OPEN' | 'RESOLVED';

// Uno de los dos documentos, con la versión de cuando se detectó la contradicción.
export interface ConflictAlertDocument {
  id: string;
  title: string;
  status: DocumentStatus;
  versionNumber: number;
  section: string;
  isCurrentVersion: boolean; // false: hay una versión nueva (R17)
}

export interface ConflictAlert {
  id: string;
  status: ConflictAlertStatus;
  documents: [ConflictAlertDocument, ConflictAlertDocument];
  question: string;
  firstDetectedAt: string;
  lastDetectedAt: string;
  occurrences: number;
  resolvedAt: string | null;
  resolvedBy: DocumentReference | null; // spec 008: { id, name, isActive }
  resolutionNote: string | null;
}

export interface ConflictAlertPage {
  data: ConflictAlert[];
  total: number; // las del estado pedido
  openTotal: number; // las abiertas, para "Alertas (n)"
  page: number;
  limit: number;
}

export const CONFLICT_ALERTS_CHANGED_EVENT = 'conflict-alerts:changed';

export function notifyConflictAlertsChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(CONFLICT_ALERTS_CHANGED_EVENT));
  }
}

export function createConflictAlertsApi(client: ApiClient) {
  return {
    listConflictAlerts(status: ConflictAlertStatus, page: number, limit: number, signal?: AbortSignal) {
      return client.request<ConflictAlertPage>(
        `/api/conflict-alerts?status=${status}&page=${page}&limit=${limit}`,
        { signal },
      );
    },

    // Una nota vacía no se manda: la API la guardaría como null igual.
    async resolveConflictAlert(id: string, note?: string) {
      const alert = await client.request<ConflictAlert>(`/api/conflict-alerts/${encodeURIComponent(id)}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(note ? { note } : {}),
      });
      notifyConflictAlertsChanged();
      return alert;
    },
  };
}
