import { describe, expect, test } from 'vitest';
import type { VersionHistoryItem } from '@/lib/api/procedure-versions';
import {
  VERSION_LABELS,
  VERSION_TONES,
  findDraft,
  hasPublished,
  newestFirst,
} from '@/lib/procedures/versions';
import { PROCEDURE_ID } from '../../support/procedures';

const item = (versionNumber: number, status: VersionHistoryItem['status']): VersionHistoryItem => ({
  id: `1b000000-0000-4000-8000-00000000000${versionNumber}`,
  procedureId: PROCEDURE_ID,
  versionNumber,
  status,
  title: 'Cierre de caja',
  createdAt: '2026-11-01T10:00:00.000Z',
  publishedAt: null,
  publishedBy: null,
  isCritical: false,
  changeSummary: null,
  stepCount: 1,
});

describe('how a version looks', () => {
  test('each state is said with a word, never only with a color (DESIGN.md 2.2)', () => {
    expect(VERSION_LABELS).toEqual({
      DRAFT: 'Borrador',
      PUBLISHED: 'Publicada',
      SUPERSEDED: 'Reemplazada',
    });
  });

  test('draft is blue, published is green and superseded is grey', () => {
    expect(VERSION_TONES).toEqual({ DRAFT: 'azul', PUBLISHED: 'exito', SUPERSEDED: 'gris' });
  });
});

describe('newestFirst', () => {
  test('orders by version number, highest first, without changing the list it receives', () => {
    const list = [item(1, 'SUPERSEDED'), item(3, 'DRAFT'), item(2, 'PUBLISHED')];

    expect(newestFirst(list).map((version) => version.versionNumber)).toEqual([3, 2, 1]);
    expect(list.map((version) => version.versionNumber)).toEqual([1, 3, 2]);
  });

  test('an empty list stays empty', () => {
    expect(newestFirst([])).toEqual([]);
  });
});

describe('findDraft and hasPublished', () => {
  test('finds the draft when there is one', () => {
    const list = [item(2, 'DRAFT'), item(1, 'PUBLISHED')];

    expect(findDraft(list)?.versionNumber).toBe(2);
    expect(hasPublished(list)).toBe(true);
  });

  test('without a draft there is none, and a list of only superseded versions has no published one', () => {
    const list = [item(1, 'SUPERSEDED')];

    expect(findDraft(list)).toBeUndefined();
    expect(hasPublished(list)).toBe(false);
  });

  test('an empty list has neither', () => {
    expect(findDraft([])).toBeUndefined();
    expect(hasPublished([])).toBe(false);
  });
});
