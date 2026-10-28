import {
  insertStep,
  numberSteps,
  removeStep,
  reorderSteps,
} from './step-order';

const STEPS = ['A', 'B', 'C'];

describe('insertStep', () => {
  it('R7: adds the step at the end when no position is given', () => {
    expect(insertStep(STEPS, 'X')).toEqual(['A', 'B', 'C', 'X']);
  });

  it('R7: adds the step at the beginning (position 1)', () => {
    expect(insertStep(STEPS, 'X', 1)).toEqual(['X', 'A', 'B', 'C']);
  });

  it('R7: adds the step in the middle and pushes the following ones down', () => {
    expect(insertStep(STEPS, 'X', 2)).toEqual(['A', 'X', 'B', 'C']);
  });

  it('R7: position n + 1 is the same as the end', () => {
    expect(insertStep(STEPS, 'X', 4)).toEqual(['A', 'B', 'C', 'X']);
  });

  it('R7: adds the first step to an empty version', () => {
    expect(insertStep([], 'X')).toEqual(['X']);
    expect(insertStep([], 'X', 1)).toEqual(['X']);
  });

  it.each([0, -1, 5, 1.5, NaN])(
    'returns null when the position %p is outside 1..n + 1',
    (position) => {
      expect(insertStep(STEPS, 'X', position)).toBeNull();
    },
  );

  it('does not change the list it receives', () => {
    const ids = [...STEPS];

    insertStep(ids, 'X', 2);

    expect(ids).toEqual(STEPS);
  });
});

describe('removeStep', () => {
  it.each([
    ['the first', 'A', ['B', 'C']],
    ['a middle', 'B', ['A', 'C']],
    ['the last', 'C', ['A', 'B']],
  ])('R7: removes %s step and the following ones move up', (_, id, expected) => {
    expect(removeStep(STEPS, id)).toEqual(expected);
  });

  it('leaves an empty list when the only step is removed', () => {
    expect(removeStep(['A'], 'A')).toEqual([]);
  });

  it('returns null when the step is not in the list', () => {
    expect(removeStep(STEPS, 'Z')).toBeNull();
    expect(removeStep([], 'A')).toBeNull();
  });

  it('does not change the list it receives', () => {
    const ids = [...STEPS];

    removeStep(ids, 'B');

    expect(ids).toEqual(STEPS);
  });
});

describe('reorderSteps', () => {
  it('R8: returns the requested order', () => {
    expect(reorderSteps(STEPS, ['C', 'A', 'B'])).toEqual(['C', 'A', 'B']);
  });

  it('R8: accepts the same order (nothing moves)', () => {
    expect(reorderSteps(STEPS, ['A', 'B', 'C'])).toEqual(STEPS);
  });

  it('R8: accepts an empty request for an empty version', () => {
    expect(reorderSteps([], [])).toEqual([]);
  });

  it.each([
    ['a step is missing', ['A', 'C']],
    ['a step is repeated', ['A', 'A', 'C']],
    ['a step is repeated and another is missing', ['A', 'A', 'B']],
    ['a step is not from the version', ['A', 'B', 'Z']],
    ['there is an extra step', ['A', 'B', 'C', 'D']],
    ['the request is empty', []],
  ])('R8: returns null when %s', (_, requested) => {
    expect(reorderSteps(STEPS, requested)).toBeNull();
  });

  it('returns a copy and does not change the lists it receives', () => {
    const current = [...STEPS];
    const requested = ['C', 'A', 'B'];

    const result = reorderSteps(current, requested);

    expect(result).not.toBe(requested);
    expect(current).toEqual(STEPS);
    expect(requested).toEqual(['C', 'A', 'B']);
  });
});

describe('numberSteps', () => {
  it('R7: numbers the steps from 1 to n in list order', () => {
    expect(numberSteps(['C', 'A', 'B'])).toEqual([
      { id: 'C', order: 1 },
      { id: 'A', order: 2 },
      { id: 'B', order: 3 },
    ]);
  });

  it('returns an empty list for a version without steps', () => {
    expect(numberSteps([])).toEqual([]);
  });

  it('E5: after inserting at position 2 the numbers go from 1 to 4 without gaps', () => {
    const inserted = insertStep(STEPS, 'X', 2) ?? [];

    expect(numberSteps(inserted).map((step) => step.order)).toEqual([
      1, 2, 3, 4,
    ]);
  });

  it('E6: after removing the middle step the numbers are 1 and 2', () => {
    const removed = removeStep(STEPS, 'B') ?? [];

    expect(numberSteps(removed)).toEqual([
      { id: 'A', order: 1 },
      { id: 'C', order: 2 },
    ]);
  });
});
