// Calls to the reads of /api/procedures (spec 006, HU11): the list and the detail of the procedures
// the user can see. The visibility is decided by the API (R13 and R14); the web shows what comes.
// TODO: these types are copied from apps/api/src/procedures/dto/procedure-view.response.ts; keep
// them in sync with the API until packages/shared exists.
import type { ApiClient } from './client';
import type { ProcedureVersionStatus } from './procedures';
import type { VersionStep } from './procedure-versions';

export interface ProcedureAreaView {
  id: string;
  name: string;
  // false: deactivated. Only an ADMIN receives these.
  isActive: boolean;
}

// The version a list item or a detail shows.
export interface ShownVersion {
  id: string;
  versionNumber: number;
  status: ProcedureVersionStatus;
  title: string;
  description: string | null;
  stepCount: number;
}

export interface ProcedureListItem {
  id: string;
  createdAt: string;
  version: ShownVersion;
  areas: ProcedureAreaView[];
  // Only for an ADMIN.
  hasOpenDraft?: boolean;
}

export interface ProcedureListPage {
  // Newest first.
  data: ProcedureListItem[];
  total: number;
  page: number;
  limit: number;
}

export interface ProcedureDetail {
  id: string;
  createdAt: string;
  areas: ProcedureAreaView[];
  hasOpenDraft?: boolean;
  // An ADMIN: the open draft or the current one. The others: the current one.
  version: ShownVersion & { steps: VersionStep[] };
}

export interface ListProceduresParams {
  page?: number;
  limit?: number;
}

export function createProcedureViewApi(client: ApiClient) {
  return {
    listProcedures(params: ListProceduresParams = {}, signal?: AbortSignal) {
      const query = new URLSearchParams();
      if (params.page !== undefined) query.set('page', String(params.page));
      if (params.limit !== undefined) query.set('limit', String(params.limit));
      const text = query.toString();
      return client.request<ProcedureListPage>(`/api/procedures${text && `?${text}`}`, { signal });
    },

    getProcedure(procedureId: string, signal?: AbortSignal) {
      return client.request<ProcedureDetail>(`/api/procedures/${encodeURIComponent(procedureId)}`, {
        signal,
      });
    },
  };
}
