// How each answer of the API changes the local copy of a procedure (spec 006). Pure functions: they
// return a new copy and never change the one they receive.
import type { VersionDetail } from '@/lib/api/procedure-versions';
import type { StepResponse, VersionResponse } from '@/lib/api/procedures';
import type { EditableProcedure, EditableStep } from './editable';

const byOrder = (a: EditableStep, b: EditableStep) => a.order - b.order;

const toStoredStep = (step: StepResponse): EditableStep => ({
  id: step.id,
  order: step.order,
  title: step.title,
  description: step.description,
});

export function withDraft(procedure: EditableProcedure, version: VersionResponse): EditableProcedure {
  return { ...procedure, title: version.title, description: version.description };
}

// A step added without a position goes at the end.
export function withStepAdded(procedure: EditableProcedure, step: StepResponse): EditableProcedure {
  return { ...procedure, steps: [...procedure.steps, toStoredStep(step)].sort(byOrder) };
}

export function withStepUpdated(procedure: EditableProcedure, step: StepResponse): EditableProcedure {
  return {
    ...procedure,
    steps: procedure.steps.map((item) => (item.id === step.id ? toStoredStep(step) : item)),
  };
}

// The API moves the following steps up (R7): the copy numbers them from 1 again.
export function withStepDeleted(procedure: EditableProcedure, stepId: string): EditableProcedure {
  return {
    ...procedure,
    steps: procedure.steps
      .filter((item) => item.id !== stepId)
      .sort(byOrder)
      .map((item, index) => ({ ...item, order: index + 1 })),
  };
}

// PUT …/steps/order answers every step, already in the new order.
export function withStepsReordered(
  procedure: EditableProcedure,
  steps: StepResponse[],
): EditableProcedure {
  return { ...procedure, steps: steps.map(toStoredStep).sort(byOrder) };
}

export function withAreas(procedure: EditableProcedure, areaIds: string[]): EditableProcedure {
  return { ...procedure, areaIds: [...areaIds] };
}

// The copy follows a new draft (spec 015, T13): its version and steps, with what belongs to the
// procedure (id, areas, creation) as it was.
export function withDraftVersion(procedure: EditableProcedure, draft: VersionDetail): EditableProcedure {
  return {
    ...procedure,
    versionId: draft.id,
    versionNumber: draft.versionNumber,
    status: draft.status,
    title: draft.title,
    description: draft.description,
    steps: draft.steps.map((step) => ({ ...step })).sort(byOrder),
  };
}
