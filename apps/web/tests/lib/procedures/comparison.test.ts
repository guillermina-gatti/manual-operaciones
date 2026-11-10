import { describe, expect, test } from 'vitest';
import type { VersionComparison } from '@/lib/api/procedure-versions';
import { describeChange, hasDifferences, modifiedTitle } from '@/lib/procedures/comparison';

const empty = (): VersionComparison => ({
  from: { id: 'v1', versionNumber: 1, status: 'SUPERSEDED' },
  to: { id: 'v2', versionNumber: 2, status: 'PUBLISHED' },
  added: [],
  removed: [],
  modified: [],
  unchanged: 3,
});

const step = { id: 's1', order: 1, title: 'Contar', description: '' };

describe('hasDifferences (spec 015, R10)', () => {
  test('two versions with the same steps have none', () => {
    expect(hasDifferences(empty())).toBe(false);
  });

  test.each([
    ['a step added', { added: [step] }],
    ['a step removed', { removed: [step] }],
    ['a step modified', { modified: [{ before: step, after: step, changedFields: ['order' as const] }] }],
  ])('%s is a difference', (_case, changes) => {
    expect(hasDifferences({ ...empty(), ...changes })).toBe(true);
  });
});

describe('modifiedTitle (spec 015, R10)', () => {
  const modified = (changedFields: ('title' | 'description' | 'order')[], before: string, after: string) => ({
    before: { ...step, title: before },
    after: { ...step, title: after },
    changedFields,
  });

  test('a step whose title changed shows the new title and the one it had before', () => {
    expect(modifiedTitle(modified(['title'], 'Encender las luces', 'Salón y vidriera'))).toBe(
      'Salón y vidriera · antes: Encender las luces',
    );
  });

  test('also when something else changed too', () => {
    expect(modifiedTitle(modified(['title', 'description'], 'Contar', 'Contar el efectivo'))).toBe(
      'Contar el efectivo · antes: Contar',
    );
  });

  test.each([['description'], ['order']] as const)('if only the %s changed, it is just the title', (field) => {
    expect(modifiedTitle(modified([field], 'Contar', 'Contar'))).toBe('Contar');
  });
});

describe('describeChange', () => {
  test.each([
    [['title'] as const, 'Cambió el título'],
    [['description'] as const, 'Cambió la descripción'],
    [['order'] as const, 'Cambió de lugar: de la posición 2 a la 4'],
    [['title', 'description'] as const, 'Cambió el título y la descripción'],
    [['title', 'description', 'order'] as const, 'Cambió el título, la descripción y de lugar: de la posición 2 a la 4'],
  ])('%j → "%s"', (changedFields, text) => {
    const modified = {
      before: { ...step, order: 2 },
      after: { ...step, order: 4 },
      changedFields: [...changedFields],
    };

    expect(describeChange(modified)).toBe(text);
  });
});
