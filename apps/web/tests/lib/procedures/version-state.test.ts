import { describe, expect, test } from 'vitest';
import { withDraftVersion } from '@/lib/procedures/snapshot';
import { versionSummary } from '@/lib/procedures/versions';
import { editable } from '../../support/procedures';
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

describe('the state of the version the editor holds', () => {
  test('following a new draft sets the state of that draft', () => {
    const published = editable({ status: 'PUBLISHED' });

    const next = withDraftVersion(published, versionDetail({ id: V2, versionNumber: 2, status: 'DRAFT' }));

    expect(next.status).toBe('DRAFT');
  });
});
