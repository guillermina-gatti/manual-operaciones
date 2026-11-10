// Entry point of the procedures screens (spec 006). The calls live here, and not in lib/api/index.ts,
// so no file of another pair changes: they use the same client, with the session's Bearer.
import { apiClient } from '@/lib/api';
import { createProcedureVersionsApi } from '@/lib/api/procedure-versions';
import { createProceduresApi } from '@/lib/api/procedures';

// Spec 015: publish, history and detail of a version, and a new draft from the published one.
export const { listVersions, getVersion, publishVersion, createVersionDraft } =
  createProcedureVersionsApi(apiClient);
export type {
  PublishValues,
  VersionDetail,
  VersionHistoryItem,
  VersionHistoryPage,
  VersionPublisher,
  VersionStep,
} from '@/lib/api/procedure-versions';

export const {
  createProcedure,
  updateVersion,
  discardDraft,
  addStep,
  updateStep,
  deleteStep,
  reorderSteps,
  setAreas,
} = createProceduresApi(apiClient);

export { describeProcedureError, PROCEDURE_MESSAGES } from '@/lib/api/procedure-errors';
export type {
  ProcedureErrorContext,
  ProcedureErrorDescription,
} from '@/lib/api/procedure-errors';
export type {
  AreasResponse,
  CreateProcedureValues,
  CreateStepValues,
  ProcedureResponse,
  ProcedureVersionStatus,
  StepResponse,
  UpdateStepValues,
  UpdateVersionValues,
  VersionResponse,
} from '@/lib/api/procedures';
