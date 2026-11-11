import { describe, expect, test } from 'vitest';
import {
  withAreas,
  withDraft,
  withStepAdded,
  withStepDeleted,
  withStepUpdated,
  withStepsReordered,
} from '@/lib/procedures/snapshot';
import {
  OPERACIONES,
  STEP_A,
  STEP_B,
  STEP_C,
  VENTAS,
  VERSION_ID,
  procedureResponse,
  stepResponse,
  editable,
} from '../../support/procedures';

const step = (id: string, order: number, title: string) => ({ id, order, title, description: '' });
const threeSteps = () =>
  editable({ steps: [step(STEP_A, 1, 'A'), step(STEP_B, 2, 'B'), step(STEP_C, 3, 'C')] });

describe('withDraft', () => {
  test('takes the title and description of the updated version', () => {
    const version = { ...procedureResponse().versions[0], title: 'Cierre', description: 'Nueva' };

    const result = withDraft(editable(), version);

    expect(result.title).toBe('Cierre');
    expect(result.description).toBe('Nueva');
    expect(result.versionId).toBe(VERSION_ID);
  });
});

describe('steps', () => {
  test('withStepAdded puts the new step at the end', () => {
    const result = withStepAdded(editable({ steps: [step(STEP_A, 1, 'A')] }), stepResponse(STEP_B, 2, 'B', 'x'));

    expect(result.steps.map((s) => [s.id, s.order])).toEqual([
      [STEP_A, 1],
      [STEP_B, 2],
    ]);
    expect(result.steps[1].description).toBe('x');
  });

  test('withStepUpdated replaces that step and no other', () => {
    const result = withStepUpdated(threeSteps(), stepResponse(STEP_B, 2, 'B nuevo', 'detalle'));

    expect(result.steps.map((s) => s.title)).toEqual(['A', 'B nuevo', 'C']);
    expect(result.steps[1].description).toBe('detalle');
  });

  test('withStepDeleted moves the following steps up, without gaps', () => {
    const result = withStepDeleted(threeSteps(), STEP_A);

    expect(result.steps.map((s) => [s.id, s.order])).toEqual([
      [STEP_B, 1],
      [STEP_C, 2],
    ]);
  });

  test('withStepsReordered takes the order the API answers', () => {
    const result = withStepsReordered(threeSteps(), [
      stepResponse(STEP_C, 1, 'C'),
      stepResponse(STEP_A, 2, 'A'),
      stepResponse(STEP_B, 3, 'B'),
    ]);

    expect(result.steps.map((s) => [s.id, s.order])).toEqual([
      [STEP_C, 1],
      [STEP_A, 2],
      [STEP_B, 3],
    ]);
  });

  test('none of them changes the copy it received', () => {
    const original = threeSteps();
    const before = JSON.stringify(original);

    withStepAdded(original, stepResponse('x', 4, 'D'));
    withStepUpdated(original, stepResponse(STEP_A, 1, 'otro'));
    withStepDeleted(original, STEP_B);
    withStepsReordered(original, [stepResponse(STEP_B, 1, 'B')]);

    expect(JSON.stringify(original)).toBe(before);
  });
});

describe('withAreas', () => {
  test('replaces the whole set of areas', () => {
    const result = withAreas(editable({ areaIds: [VENTAS] }), [OPERACIONES]);

    expect(result.areaIds).toEqual([OPERACIONES]);
  });

  test('an empty set is valid', () => {
    expect(withAreas(editable({ areaIds: [VENTAS] }), []).areaIds).toEqual([]);
  });
});
