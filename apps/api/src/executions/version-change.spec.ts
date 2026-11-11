import type {
  CatalogProcedureVersion,
  CatalogPublication,
} from './ports/procedures-catalog';
import { NO_CHANGE, versionChangeOf } from './version-change';

const PROCEDURE = '1a000000-0000-4000-8000-000000000001';
const V1 = '1b000000-0000-4000-8000-000000000001';
const V2 = '1b000000-0000-4000-8000-000000000002';
const V3 = '1b000000-0000-4000-8000-000000000009';
const AT = new Date('2026-11-10T12:00:00.000Z');

const version = (
  versionId: string,
  versionNumber?: number,
): CatalogProcedureVersion => ({
  procedureId: PROCEDURE,
  versionId,
  areaIds: [],
  steps: [],
  versionNumber,
});

const published = (
  versionId: string,
  versionNumber: number,
  isCritical = false,
  changeSummary: string | null = null,
): CatalogPublication => ({
  versionId,
  versionNumber,
  isCritical,
  changeSummary,
  publishedAt: AT,
});

describe('versionChangeOf', () => {
  it('the execution is on the current version: no change', () => {
    expect(versionChangeOf(V2, version(V2, 2), [])).toEqual(NO_CHANGE);
  });

  it('without a published version there is nothing to change to', () => {
    expect(versionChangeOf(V1, null, [published(V2, 2)])).toEqual(NO_CHANGE);
  });

  it('a newer version without a critical change: changed, not critical', () => {
    expect(
      versionChangeOf(V1, version(V2, 2), [
        published(V2, 2, false, 'Se agrega un paso'),
      ]),
    ).toEqual({
      changed: true,
      critical: false,
      currentVersionId: V2,
      currentVersionNumber: 2,
      changes: [
        {
          versionNumber: 2,
          isCritical: false,
          changeSummary: 'Se agrega un paso',
          publishedAt: AT,
        },
      ],
    });
  });

  it('the current version is a critical change: critical', () => {
    const change = versionChangeOf(V1, version(V2, 2), [
      published(V2, 2, true, 'Cambia el límite de caja'),
    ]);

    expect(change).toMatchObject({ changed: true, critical: true });
  });

  it('a critical version in between is enough, though the current one is not critical', () => {
    const change = versionChangeOf(V1, version(V3, 3), [
      published(V2, 2, true, 'Cambia el límite de caja'),
      published(V3, 3, false, 'Corrige una palabra'),
    ]);

    expect(change.critical).toBe(true);
    expect(change.changes.map((c) => c.versionNumber)).toEqual([2, 3]);
  });

  it('the changes go oldest first, whatever the order of the catalog', () => {
    const change = versionChangeOf(V1, version(V3, 3), [
      published(V3, 3),
      published(V2, 2),
    ]);

    expect(change.changes.map((c) => c.versionNumber)).toEqual([2, 3]);
  });

  it('a version after the current one does not count', () => {
    const change = versionChangeOf(V1, version(V2, 2), [
      published(V2, 2),
      published(V3, 3, true),
    ]);

    expect(change).toMatchObject({ critical: false });
    expect(change.changes).toHaveLength(1);
  });

  it('a catalog without version numbers: every version after counts', () => {
    const change = versionChangeOf(V1, version(V3), [published(V2, 2, true)]);

    expect(change).toMatchObject({
      changed: true,
      critical: true,
      currentVersionNumber: null,
    });
  });

  it('changed even when the catalog does not list what was published in between', () => {
    expect(versionChangeOf(V1, version(V2, 2), [])).toEqual({
      changed: true,
      critical: false,
      currentVersionId: V2,
      currentVersionNumber: 2,
      changes: [],
    });
  });
});
