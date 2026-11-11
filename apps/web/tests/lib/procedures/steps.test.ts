import { describe, expect, test } from 'vitest';
import { moveStep } from '@/lib/procedures/steps';
import { STEP_A, STEP_B, STEP_C } from '../../support/procedures';

const steps = [
  { id: STEP_A, order: 1 },
  { id: STEP_B, order: 2 },
  { id: STEP_C, order: 3 },
];

describe('moveStep', () => {
  test('moving a step up swaps it with the one before', () => {
    expect(moveStep(steps, STEP_B, 'up')).toEqual([STEP_B, STEP_A, STEP_C]);
  });

  test('moving a step down swaps it with the one after', () => {
    expect(moveStep(steps, STEP_B, 'down')).toEqual([STEP_A, STEP_C, STEP_B]);
  });

  test('the first step cannot go up', () => {
    expect(moveStep(steps, STEP_A, 'up')).toBeNull();
  });

  test('the last step cannot go down', () => {
    expect(moveStep(steps, STEP_C, 'down')).toBeNull();
  });

  test('a step that is not in the list cannot move', () => {
    expect(moveStep(steps, 'otro', 'up')).toBeNull();
  });

  test('an empty list has nothing to move', () => {
    expect(moveStep([], STEP_A, 'down')).toBeNull();
  });

  test('uses the order of the steps, not the order of the list', () => {
    const shuffled = [steps[2], steps[0], steps[1]];

    expect(moveStep(shuffled, STEP_A, 'down')).toEqual([STEP_B, STEP_A, STEP_C]);
  });

  test('does not change the list it received', () => {
    const copy = steps.map((s) => ({ ...s }));

    moveStep(copy, STEP_B, 'up');

    expect(copy).toEqual(steps);
  });
});
