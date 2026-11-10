// Calls to the versions of /api/procedures (spec 015: publish, history and detail of a version).
// TODO: these types are copied from apps/api/src/procedures/dto/version-*.response.ts; keep them in
// sync with the API until packages/shared exists.
import type { ApiClient } from './client';
import type { ProcedureVersionStatus, VersionResponse } from './procedures';

export interface VersionPublisher {
  id: string;
  // null if the directory does not know them.
  name: string | null;
}

export interface VersionHistoryItem {
  id: string;
  procedureId: string;
  versionNumber: number;
  status: ProcedureVersionStatus;
  title: string;
  createdAt: string;
  // null while it is not published.
  publishedAt: string | null;
  publishedBy: VersionPublisher | null;
  isCritical: boolean;
  changeSummary: string | null;
  stepCount: number;
}

export interface VersionHistoryPage {
  // Newest first.
  data: VersionHistoryItem[];
  total: number;
  page: number;
  limit: number;
}

export interface VersionStep {
  id: string;
  order: number;
  title: string;
  // Empty text if none.
  description: string;
}

export interface VersionDetail extends VersionHistoryItem {
  description: string | null;
  steps: VersionStep[];
}

export interface PublishValues {
  isCritical?: boolean;
  changeSummary?: string;
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

const versionsPath = (procedureId: string) =>
  `/api/procedures/${encodeURIComponent(procedureId)}/versions`;

export function createProcedureVersionsApi(client: ApiClient) {
  return {
    // One page of the history (R8).
    listVersions(
      procedureId: string,
      params: { page?: number; limit?: number } = {},
      signal?: AbortSignal,
    ) {
      const query = new URLSearchParams();
      if (params.page !== undefined) query.set('page', String(params.page));
      if (params.limit !== undefined) query.set('limit', String(params.limit));
      const text = query.toString();
      return client.request<VersionHistoryPage>(
        text ? `${versionsPath(procedureId)}?${text}` : versionsPath(procedureId),
        { signal },
      );
    },

    // One version with its steps, in any state (R9).
    getVersion(procedureId: string, versionId: string, signal?: AbortSignal) {
      return client.request<VersionDetail>(
        `${versionsPath(procedureId)}/${encodeURIComponent(versionId)}`,
        { signal },
      );
    },

    // The draft becomes the published version (R2 to R5).
    publishVersion(
      procedureId: string,
      versionId: string,
      values: PublishValues = {},
      signal?: AbortSignal,
    ) {
      return client.request<VersionHistoryItem>(
        `${versionsPath(procedureId)}/${encodeURIComponent(versionId)}/publish`,
        { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(values), signal },
      );
    },

    // A new draft copied from the published version (spec 006, R4).
    createVersionDraft(procedureId: string, signal?: AbortSignal) {
      return client.request<VersionResponse>(versionsPath(procedureId), {
        method: 'POST',
        signal,
      });
    },
  };
}
