import { describe, expect, test } from 'vitest';
import { parseProcedures } from '@/lib/procedures/session-list';
import { withDraftVersion } from '@/lib/procedures/snapshot';
import { versionSummary } from '@/lib/procedures/versions';
import { stored } from '../../support/procedures';
import { V2, versionDetail } from '../../support/versions';

describe('versionSummary (spec 015)', () => {
  test.each([
    ['DRAFT', 'Versión 3 · borrador'],
    ['PUBLISHED', 'Versión 3 · publicada'],
    ['SUPERSEDED', 'Versión 3 · reemplazada'],
  ] as const)('%s → "%s"', (status, text) => {
    expect(versionSummary(3, status)).toBe(text);
  });
});

describe('the state of the version in the local copy', () => {
  test('is kept when the copy is stored and read again', () => {
    const [copy] = parseProcedures(JSON.stringify([stored({ status: 'PUBLISHED' })]));

    expect(copy.status).toBe('PUBLISHED');
  });

  test('a copy from before, without state, is still read', () => {
    expect(parseProcedures(JSON.stringify([stored()]))).toHaveLength(1);
  });

  test('a state that does not exist leaves the entry out: what is stored is not trusted', () => {
    const raw = JSON.stringify([{ ...stored(), status: 'ARCHIVED' }]);

    expect(parseProcedures(raw)).toEqual([]);
  });

  test('following a new draft sets the state of that draft', () => {
    const published = stored({ status: 'PUBLISHED' });

    const next = withDraftVersion(published, versionDetail({ id: V2, versionNumber: 2, status: 'DRAFT' }));

    expect(next.status).toBe('DRAFT');
  });
});
