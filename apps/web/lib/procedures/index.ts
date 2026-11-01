// Entry point of the procedures screens (spec 006). The calls live here, and not in lib/api/index.ts,
// so no file of another pair changes: they use the same client, with the session's Bearer.
import { apiClient } from '@/lib/api';
import { createProceduresApi } from '@/lib/api/procedures';

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
