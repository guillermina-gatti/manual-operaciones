// How each answer of the API changes the local copy of a procedure (spec 006). Pure functions: they
// return a new copy and never change the one they receive.
import type { ProcedureResponse, StepResponse, VersionResponse } from '@/lib/api/procedures';
import type { StoredProcedure, StoredStep } from './session-list';

const byOrder = (a: StoredStep, b: StoredStep) => a.order - b.order;

const toStoredStep = (step: StepResponse): StoredStep => ({
  id: step.id,
  order: step.order,
  title: step.title,
  description: step.description,
});

// POST /api/procedures: a new procedure only has its version 1, as a DRAFT, with no steps.
export function fromCreated(response: ProcedureResponse): StoredProcedure {
  const draft = response.versions[0];
  return {
    id: response.id,
    versionId: draft.id,
    versionNumber: draft.versionNumber,
    title: draft.title,
    description: draft.description,
    areaIds: [...response.areaIds],
    steps: [],
    createdAt: response.createdAt,
  };
}

export function withDraft(procedure: StoredProcedure, version: VersionResponse): StoredProcedure {
  return { ...procedure, title: version.title, description: version.description };
}

// A step added without a position goes at the end.
export function withStepAdded(procedure: StoredProcedure, step: StepResponse): StoredProcedure {
  return { ...procedure, steps: [...procedure.steps, toStoredStep(step)].sort(byOrder) };
}

export function withStepUpdated(procedure: StoredProcedure, step: StepResponse): StoredProcedure {
  return {
    ...procedure,
    steps: procedure.steps.map((item) => (item.id === step.id ? toStoredStep(step) : item)),
  };
}

// The API moves the following steps up (R7): the copy numbers them from 1 again.
export function withStepDeleted(procedure: StoredProcedure, stepId: string): StoredProcedure {
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
  procedure: StoredProcedure,
  steps: StepResponse[],
): StoredProcedure {
  return { ...procedure, steps: steps.map(toStoredStep).sort(byOrder) };
}

export function withAreas(procedure: StoredProcedure, areaIds: string[]): StoredProcedure {
  return { ...procedure, areaIds: [...areaIds] };
}
