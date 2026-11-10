import { compareVersions } from './version-compare';
import type { CompareStep, CompareVersion } from './version-compare';

// A step with its key: the key is what makes two steps "the same" across versions (D11).
const step = (key: string, order: number, title: string, description = ''): CompareStep => ({
  key,
  id: `id-${key}-${order}`,
  order,
  title,
  description,
});

const version = (versionNumber: number, steps: CompareStep[]): CompareVersion => ({
  id: `version-${versionNumber}`,
  versionNumber,
  status: 'PUBLISHED',
  steps,
});

const A = (order = 1) => step('a', order, 'Contar');
const B = (order = 2, description = '') => step('b', order, 'Comparar', description);
const C = (order = 3) => step('c', order, 'Cerrar');
const D = (order = 3) => step('d', order, 'Guardar');

describe('compareVersions (spec 015, R10)', () => {
  it('E12: tells the step that was added, the one that was removed and the one that changed', () => {
    const result = compareVersions(
      version(1, [A(), B(), C()]),
      version(2, [A(), B(2, 'Con el reporte'), D()]),
    );

    expect(result.added).toEqual([{ id: 'id-d-3', order: 3, title: 'Guardar', description: '' }]);
    expect(result.removed).toEqual([{ id: 'id-c-3', order: 3, title: 'Cerrar', description: '' }]);
    expect(result.modified).toEqual([
      {
        before: { id: 'id-b-2', order: 2, title: 'Comparar', description: '' },
        after: { id: 'id-b-2', order: 2, title: 'Comparar', description: 'Con el reporte' },
        changedFields: ['description'],
      },
    ]);
    expect(result.unchanged).toBe(1);
  });

  it('E13: a step that only changed its place is modified in its order', () => {
    const result = compareVersions(version(1, [A(1), B(2)]), version(2, [B(1), A(2)]));

    expect(result.modified.map((item) => item.changedFields)).toEqual([['order'], ['order']]);
    expect(result.added).toEqual([]);
    expect(result.removed).toEqual([]);
    expect(result.unchanged).toBe(0);
  });

  it('lists every field that changed, in the order title, description, order', () => {
    const before = step('a', 1, 'Contar', 'Todo');
    const after = step('a', 2, 'Contar el efectivo', 'Billetes');

    const result = compareVersions(version(1, [before]), version(2, [after]));

    expect(result.modified[0].changedFields).toEqual(['title', 'description', 'order']);
  });

  it('two versions with the same steps have nothing added, removed or modified', () => {
    const result = compareVersions(version(1, [A(), B()]), version(2, [A(), B()]));

    expect(result).toMatchObject({ added: [], removed: [], modified: [], unchanged: 2 });
  });

  it('a step with a different id but the same key and content is the same step: it is unchanged', () => {
    const copied = { ...A(), id: 'a-new-id' };

    const result = compareVersions(version(1, [A()]), version(2, [copied]));

    expect(result.unchanged).toBe(1);
    expect(result.modified).toEqual([]);
  });

  it('two empty versions have no differences', () => {
    expect(compareVersions(version(1, []), version(2, []))).toMatchObject({
      added: [],
      removed: [],
      modified: [],
      unchanged: 0,
    });
  });

  it('from an empty version, everything is added; to an empty one, everything is removed', () => {
    expect(compareVersions(version(1, []), version(2, [A(), B()])).added).toHaveLength(2);
    expect(compareVersions(version(1, [A(), B()]), version(2, [])).removed).toHaveLength(2);
  });

  it('each list follows the order of its version, whatever order the steps arrive in', () => {
    const result = compareVersions(
      version(1, [C(3), A(1)]),
      version(2, [step('z', 2, 'Z'), step('y', 1, 'Y')]),
    );

    expect(result.removed.map((item) => item.title)).toEqual(['Contar', 'Cerrar']);
    expect(result.added.map((item) => item.title)).toEqual(['Y', 'Z']);
  });

  it('says which versions were compared, without their steps', () => {
    const result = compareVersions(version(1, [A()]), version(2, [A()]));

    expect(result.from).toEqual({ id: 'version-1', versionNumber: 1, status: 'PUBLISHED' });
    expect(result.to).toEqual({ id: 'version-2', versionNumber: 2, status: 'PUBLISHED' });
  });

  it('does not give the step key, which is internal', () => {
    const result = compareVersions(version(1, [A()]), version(2, [A(), D()]));

    expect(JSON.stringify(result)).not.toContain('"key"');
  });

  it('does not change the versions it receives', () => {
    const from = version(1, [B(), A()]);
    const to = version(2, [D(), A()]);
    const snapshot = JSON.stringify([from, to]);

    compareVersions(from, to);

    expect(JSON.stringify([from, to])).toBe(snapshot);
  });
});
