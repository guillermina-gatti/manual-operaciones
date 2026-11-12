import type { CatalogStep } from './ports/procedures-catalog';
import {
  RecordedStep,
  checkCompletable,
  currentStep,
  isComplete,
  nextStep,
  stepDurationMs,
} from './execution-progress';

const step = (n: number): CatalogStep => ({
  id: `1c000000-0000-4000-8000-00000000000${n}`,
  order: n,
  title: `Step ${n}`,
});
const STEPS = [step(1), step(2), step(3)];

const at = (minute: number) =>
  new Date(`2026-10-27T10:${String(minute).padStart(2, '0')}:00.000Z`);

const started = (s: CatalogStep, minute: number): RecordedStep => ({
  stepId: s.id,
  startedAt: at(minute),
  finishedAt: null,
});
const finished = (s: CatalogStep, from: number, to: number): RecordedStep => ({
  stepId: s.id,
  startedAt: at(from),
  finishedAt: at(to),
});

describe('currentStep', () => {
  it('is the first step when nothing was recorded', () => {
    expect(currentStep(STEPS, [])).toEqual(step(1));
  });

  it('is the started but unfinished step', () => {
    expect(currentStep(STEPS, [started(step(1), 0)])).toEqual(step(1));
  });

  it('is the first unfinished step when earlier ones are finished (resume)', () => {
    const recorded = [
      finished(step(1), 0, 3),
      finished(step(2), 3, 5),
      started(step(3), 5),
    ];

    expect(currentStep(STEPS, recorded)).toEqual(step(3));
  });

  it('is null when every step is finished', () => {
    const recorded = [
      finished(step(1), 0, 1),
      finished(step(2), 1, 2),
      finished(step(3), 2, 3),
    ];

    expect(currentStep(STEPS, recorded)).toBeNull();
  });

  it('follows the step order, not the order of the input arrays', () => {
    const recorded = [finished(step(1), 0, 1)];

    expect(currentStep([step(3), step(1), step(2)], recorded)).toEqual(step(2));
  });

  it('ignores recorded steps that are not in the version', () => {
    const foreign: RecordedStep = {
      stepId: '1c000000-0000-4000-8000-000000000099',
      startedAt: at(0),
      finishedAt: at(1),
    };

    expect(currentStep(STEPS, [foreign])).toEqual(step(1));
  });

  it('is null for a version without steps', () => {
    expect(currentStep([], [])).toBeNull();
  });
});

describe('checkCompletable', () => {
  it('accepts the current step', () => {
    expect(checkCompletable(STEPS, [started(step(1), 0)], step(1))).toBeNull();
  });

  it('accepts the current step after resuming', () => {
    const recorded = [finished(step(1), 0, 3), started(step(2), 3)];

    expect(checkCompletable(STEPS, recorded, step(2))).toBeNull();
  });

  it('rejects a later step with STEP_OUT_OF_ORDER', () => {
    expect(checkCompletable(STEPS, [started(step(1), 0)], step(3))).toBe(
      'STEP_OUT_OF_ORDER',
    );
  });

  it('rejects an already finished step with STEP_ALREADY_FINISHED', () => {
    const recorded = [finished(step(1), 0, 3), started(step(2), 3)];

    expect(checkCompletable(STEPS, recorded, step(1))).toBe(
      'STEP_ALREADY_FINISHED',
    );
  });

  it('rejects the last step twice with STEP_ALREADY_FINISHED', () => {
    const recorded = [
      finished(step(1), 0, 1),
      finished(step(2), 1, 2),
      finished(step(3), 2, 3),
    ];

    expect(checkCompletable(STEPS, recorded, step(3))).toBe(
      'STEP_ALREADY_FINISHED',
    );
  });
});

describe('nextStep', () => {
  it('is the step with the following order', () => {
    expect(nextStep(STEPS, step(1))).toEqual(step(2));
  });

  it('is null after the last step', () => {
    expect(nextStep(STEPS, step(3))).toBeNull();
  });

  it('follows the step order, not the order of the input array', () => {
    expect(nextStep([step(3), step(1), step(2)], step(2))).toEqual(step(3));
  });

  it('handles gaps in the numbering', () => {
    const gapped = [step(1), { ...step(2), order: 5 }];

    expect(nextStep(gapped, step(1))).toEqual(gapped[1]);
  });
});

describe('stepDurationMs', () => {
  it('is finishedAt - startedAt in milliseconds', () => {
    expect(stepDurationMs(finished(step(1), 0, 3))).toBe(180_000);
  });

  it('is 0 when the step started and finished at the same instant', () => {
    expect(stepDurationMs(finished(step(1), 4, 4))).toBe(0);
  });

  it('is null when the step is not finished', () => {
    expect(stepDurationMs(started(step(1), 0))).toBeNull();
  });
});

describe('isComplete', () => {
  it('is true when every step of the version is finished', () => {
    const recorded = [
      finished(step(1), 0, 1),
      finished(step(2), 1, 2),
      finished(step(3), 2, 3),
    ];

    expect(isComplete(STEPS, recorded)).toBe(true);
  });

  it('is false when the last step is started but not finished', () => {
    const recorded = [
      finished(step(1), 0, 1),
      finished(step(2), 1, 2),
      started(step(3), 2),
    ];

    expect(isComplete(STEPS, recorded)).toBe(false);
  });

  it('is false when nothing was recorded', () => {
    expect(isComplete(STEPS, [])).toBe(false);
  });

  it('does not count finished steps that are not in the version', () => {
    const foreign: RecordedStep = {
      stepId: '1c000000-0000-4000-8000-000000000099',
      startedAt: at(0),
      finishedAt: at(1),
    };

    expect(isComplete([step(1)], [foreign])).toBe(false);
  });
});
