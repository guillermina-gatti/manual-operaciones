// Calls to /api/procedures (spec 006, HU09 and HU10: drafts, steps and areas).
// TODO(HU09): these types are copied from apps/api/src/procedures/dto/*.ts. Provisional until
// packages/shared exists; keep them in sync with the API until then.
import type { ApiClient } from './client';

export type ProcedureVersionStatus = 'DRAFT' | 'PUBLISHED' | 'SUPERSEDED';

export interface VersionResponse {
  id: string;
  procedureId: string;
  versionNumber: number;
  status: ProcedureVersionStatus;
  title: string;
  description: string | null;
  stepCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProcedureResponse {
  id: string;
  areaIds: string[];
  createdAt: string;
  updatedAt: string;
  // By ascending version number.
  versions: VersionResponse[];
}

export interface StepResponse {
  id: string;
  procedureVersionId: string;
  // Place in the version, from 1.
  order: number;
  title: string;
  // Empty text if none.
  description: string;
}

export interface AreasResponse {
  areaIds: string[];
}

export interface CreateProcedureValues {
  title: string;
  description?: string;
}

export interface UpdateVersionValues {
  title?: string;
  description?: string;
}

export interface CreateStepValues {
  title: string;
  description?: string;
  // 1 to n + 1; at the end when it is missing.
  position?: number;
}

export interface UpdateStepValues {
  title?: string;
  description?: string;
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

const procedurePath = (procedureId: string) =>
  `/api/procedures/${encodeURIComponent(procedureId)}`;
const versionPath = (procedureId: string, versionId: string) =>
  `${procedurePath(procedureId)}/versions/${encodeURIComponent(versionId)}`;
const stepPath = (procedureId: string, versionId: string, stepId: string) =>
  `${versionPath(procedureId, versionId)}/steps/${encodeURIComponent(stepId)}`;

export function createProceduresApi(client: ApiClient) {
  // A request with a JSON body.
  function withBody<T>(path: string, method: string, body: unknown, signal?: AbortSignal) {
    return client.request<T>(path, {
      method,
      headers: JSON_HEADERS,
      body: JSON.stringify(body),
      signal,
    });
  }

  return {
    // The procedure with its version 1 as a DRAFT, no steps and no areas (R2).
    createProcedure(values: CreateProcedureValues, signal?: AbortSignal) {
      return withBody<ProcedureResponse>('/api/procedures', 'POST', values, signal);
    },

    // Title and/or description of the draft (R5).
    updateVersion(
      procedureId: string,
      versionId: string,
      changes: UpdateVersionValues,
      signal?: AbortSignal,
    ) {
      return withBody<VersionResponse>(versionPath(procedureId, versionId), 'PATCH', changes, signal);
    },

    // Deletes the draft; if it was the only version, the procedure goes with it (R10). 204.
    discardDraft(procedureId: string, versionId: string, signal?: AbortSignal) {
      return client.request<void>(versionPath(procedureId, versionId), {
        method: 'DELETE',
        signal,
      });
    },

    addStep(
      procedureId: string,
      versionId: string,
      values: CreateStepValues,
      signal?: AbortSignal,
    ) {
      return withBody<StepResponse>(
        `${versionPath(procedureId, versionId)}/steps`,
        'POST',
        values,
        signal,
      );
    },

    updateStep(
      procedureId: string,
      versionId: string,
      stepId: string,
      changes: UpdateStepValues,
      signal?: AbortSignal,
    ) {
      return withBody<StepResponse>(
        stepPath(procedureId, versionId, stepId),
        'PATCH',
        changes,
        signal,
      );
    },

    deleteStep(procedureId: string, versionId: string, stepId: string, signal?: AbortSignal) {
      return client.request<void>(stepPath(procedureId, versionId, stepId), {
        method: 'DELETE',
        signal,
      });
    },

    // Every step of the draft, in the new order (R8). Answers the steps in that order.
    reorderSteps(
      procedureId: string,
      versionId: string,
      stepIds: string[],
      signal?: AbortSignal,
    ) {
      return withBody<StepResponse[]>(
        `${versionPath(procedureId, versionId)}/steps/order`,
        'PUT',
        { stepIds },
        signal,
      );
    },

    // The whole set replaces the current one; it may be empty (R11).
    setAreas(procedureId: string, areaIds: string[], signal?: AbortSignal) {
      return withBody<AreasResponse>(
        `${procedurePath(procedureId)}/areas`,
        'PUT',
        { areaIds },
        signal,
      );
    },
  };
}
