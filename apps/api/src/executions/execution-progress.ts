/* Pure rules for moving through the steps of an execution (spec 005, CA2 and CA3) */
import type { CatalogStep } from './ports/procedures-catalog';

// A step row of the execution: it exists once the step was started.
export interface RecordedStep {
  stepId: string;
  startedAt: Date;
  finishedAt: Date | null;
}

// Why a step cannot be completed. The service answers 409 with it as reason.
export type CompleteRejection = 'STEP_OUT_OF_ORDER' | 'STEP_ALREADY_FINISHED';

// Steps sorted by order, without trusting the order of the input array.
const byOrder = (steps: CatalogStep[]) =>
  [...steps].sort((a, b) => a.order - b.order);

const finishedIds = (recorded: RecordedStep[]) =>
  new Set(
    recorded
      .filter((step) => step.finishedAt !== null)
      .map((step) => step.stepId),
  );

// Where to resume: the first step of the version, by order, that is not finished.
// null when every step is finished. Recorded steps outside the version are ignored.
export function currentStep(
  steps: CatalogStep[],
  recorded: RecordedStep[],
): CatalogStep | null {
  const done = finishedIds(recorded);
  return byOrder(steps).find((step) => !done.has(step.id)) ?? null;
}

// null when the step can be completed (it is the current one); otherwise why not.
// The step must belong to the version: the service checks that first (404).
export function checkCompletable(
  steps: CatalogStep[],
  recorded: RecordedStep[],
  step: CatalogStep,
): CompleteRejection | null {
  if (finishedIds(recorded).has(step.id)) return 'STEP_ALREADY_FINISHED';
  return currentStep(steps, recorded)?.id === step.id
    ? null
    : 'STEP_OUT_OF_ORDER';
}

// The step that follows, by order (gaps in the numbering are fine); null after the last.
export function nextStep(
  steps: CatalogStep[],
  step: CatalogStep,
): CatalogStep | null {
  return byOrder(steps).find((s) => s.order > step.order) ?? null;
}

// CA2: finishedAt - startedAt; null while the step is not finished.
export function stepDurationMs(step: RecordedStep): number | null {
  return step.finishedAt
    ? step.finishedAt.getTime() - step.startedAt.getTime()
    : null;
}

// True when every step of the version is finished.
export function isComplete(
  steps: CatalogStep[],
  recorded: RecordedStep[],
): boolean {
  const done = finishedIds(recorded);
  return steps.every((step) => done.has(step.id));
}
