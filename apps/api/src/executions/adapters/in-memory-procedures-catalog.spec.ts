import { AREA_IDS, FIXTURE_USERS } from '../../documents/adapters/fixtures';
import { InMemoryProceduresCatalog } from './in-memory-procedures-catalog';
import {
  FIXTURE_PROCEDURE_VERSIONS,
  PROCEDURE_AREAS,
  PROCEDURE_IDS,
  PROCEDURE_VERSION_IDS,
} from './procedure-fixtures';

const UNKNOWN_ID = '1f000000-0000-4000-8000-000000000099';
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('InMemoryProceduresCatalog.findPublished', () => {
  it('returns the published version of a procedure with its areas and steps', async () => {
    const catalog = new InMemoryProceduresCatalog();

    const version = await catalog.findPublished(PROCEDURE_IDS.cierreDeCaja);

    expect(version).toEqual({
      procedureId: PROCEDURE_IDS.cierreDeCaja,
      versionId: PROCEDURE_VERSION_IDS.cierreDeCajaV2,
      areaIds: [AREA_IDS.ventas],
      steps: expect.any(Array) as unknown,
    });
    expect(version?.steps.map((step) => step.order)).toEqual([1, 2, 3, 4]);
  });

  it('returns null for an unknown procedure', async () => {
    const catalog = new InMemoryProceduresCatalog();

    await expect(catalog.findPublished(UNKNOWN_ID)).resolves.toBeNull();
  });

  it('returns null when the procedure has no published version', async () => {
    const catalog = new InMemoryProceduresCatalog([
      { ...FIXTURE_PROCEDURE_VERSIONS[0], published: false },
    ]);

    await expect(
      catalog.findPublished(FIXTURE_PROCEDURE_VERSIONS[0].procedureId),
    ).resolves.toBeNull();
  });
});

describe('InMemoryProceduresCatalog.findVersion', () => {
  it('returns a version that is no longer published, with its own steps', async () => {
    const catalog = new InMemoryProceduresCatalog();

    const v1 = await catalog.findVersion(PROCEDURE_VERSION_IDS.cierreDeCajaV1);
    const v2 = await catalog.findVersion(PROCEDURE_VERSION_IDS.cierreDeCajaV2);

    expect(v1?.procedureId).toBe(PROCEDURE_IDS.cierreDeCaja);
    expect(v1?.steps).toHaveLength(3);
    expect(v1?.steps.map((step) => step.id)).not.toEqual(
      v2?.steps.map((step) => step.id),
    );
  });

  it('returns null for an unknown version', async () => {
    const catalog = new InMemoryProceduresCatalog();

    await expect(catalog.findVersion(UNKNOWN_ID)).resolves.toBeNull();
  });

  it('returns the steps sorted by order even if the source is not', async () => {
    const source = FIXTURE_PROCEDURE_VERSIONS[0];
    const catalog = new InMemoryProceduresCatalog([
      { ...source, steps: [...source.steps].reverse() },
    ]);

    const version = await catalog.findVersion(source.versionId);

    expect(version?.steps.map((step) => step.order)).toEqual([1, 2, 3]);
  });

  it('returns a copy, so callers cannot change the catalog', async () => {
    const catalog = new InMemoryProceduresCatalog();

    const first = await catalog.findVersion(
      PROCEDURE_VERSION_IDS.cierreDeCajaV1,
    );
    first?.areaIds.push(UNKNOWN_ID);
    first?.steps.pop();
    if (first) first.steps[0].title = 'changed';

    const second = await catalog.findVersion(
      PROCEDURE_VERSION_IDS.cierreDeCajaV1,
    );
    expect(second?.areaIds).toEqual([AREA_IDS.ventas]);
    expect(second?.steps).toHaveLength(3);
    expect(second?.steps[0].title).not.toBe('changed');
  });
});

describe('InMemoryProceduresCatalog.publish', () => {
  // Simulates a new version being published while an execution is running (CA1).
  it('makes another version the published one and unpublishes the previous', async () => {
    const catalog = new InMemoryProceduresCatalog([
      { ...FIXTURE_PROCEDURE_VERSIONS[0], published: true },
      { ...FIXTURE_PROCEDURE_VERSIONS[1], published: false },
    ]);

    catalog.publish(PROCEDURE_VERSION_IDS.cierreDeCajaV2);

    await expect(
      catalog.findPublished(PROCEDURE_IDS.cierreDeCaja),
    ).resolves.toMatchObject({
      versionId: PROCEDURE_VERSION_IDS.cierreDeCajaV2,
    });
    await expect(
      catalog.findVersion(PROCEDURE_VERSION_IDS.cierreDeCajaV1),
    ).resolves.toMatchObject({
      versionId: PROCEDURE_VERSION_IDS.cierreDeCajaV1,
    });
  });

  it('throws for an unknown version', () => {
    const catalog = new InMemoryProceduresCatalog();

    expect(() => catalog.publish(UNKNOWN_ID)).toThrow(UNKNOWN_ID);
  });
});

describe('InMemoryProceduresCatalog areas', () => {
  // areaIds are the areas currently assigned to the procedure, for any version.
  it('every version of a procedure reports the same, current areas', async () => {
    const catalog = new InMemoryProceduresCatalog();

    const v1 = await catalog.findVersion(PROCEDURE_VERSION_IDS.cierreDeCajaV1);
    const v2 = await catalog.findVersion(PROCEDURE_VERSION_IDS.cierreDeCajaV2);

    expect(v1?.areaIds).toEqual([AREA_IDS.ventas]);
    expect(v2?.areaIds).toEqual([AREA_IDS.ventas]);
  });

  it('assignAreas changes the areas reported by both methods, old versions included', async () => {
    const catalog = new InMemoryProceduresCatalog();

    catalog.assignAreas(PROCEDURE_IDS.cierreDeCaja, [AREA_IDS.operaciones]);

    await expect(
      catalog.findPublished(PROCEDURE_IDS.cierreDeCaja),
    ).resolves.toMatchObject({ areaIds: [AREA_IDS.operaciones] });
    await expect(
      catalog.findVersion(PROCEDURE_VERSION_IDS.cierreDeCajaV1),
    ).resolves.toMatchObject({ areaIds: [AREA_IDS.operaciones] });
  });

  it('assignAreas does not change the shared fixtures', () => {
    const catalog = new InMemoryProceduresCatalog();

    catalog.assignAreas(PROCEDURE_IDS.cierreDeCaja, [AREA_IDS.operaciones]);

    expect(PROCEDURE_AREAS[PROCEDURE_IDS.cierreDeCaja]).toEqual([
      AREA_IDS.ventas,
    ]);
  });

  it('a procedure without assigned areas reports none', async () => {
    const catalog = new InMemoryProceduresCatalog(
      [FIXTURE_PROCEDURE_VERSIONS[0]],
      {},
    );

    await expect(
      catalog.findVersion(FIXTURE_PROCEDURE_VERSIONS[0].versionId),
    ).resolves.toMatchObject({ areaIds: [] });
  });
});

describe('procedure fixtures', () => {
  const versionIds = FIXTURE_PROCEDURE_VERSIONS.map((v) => v.versionId);
  const stepIds = FIXTURE_PROCEDURE_VERSIONS.flatMap((v) =>
    v.steps.map((step) => step.id),
  );
  const ids = [...Object.values(PROCEDURE_IDS), ...versionIds, ...stepIds];

  it('use fixed UUIDs with a valid format, all different', () => {
    ids.forEach((id) => expect(id).toMatch(UUID));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('do not collide with the area and user fixtures', () => {
    const existing = [
      ...Object.values(AREA_IDS),
      ...Object.values(FIXTURE_USERS).map((user) => user.id),
    ];

    expect(ids.filter((id) => existing.includes(id))).toEqual([]);
  });

  it('have exactly one published version per procedure', () => {
    Object.values(PROCEDURE_IDS).forEach((procedureId) => {
      const published = FIXTURE_PROCEDURE_VERSIONS.filter(
        (v) => v.procedureId === procedureId && v.published,
      );
      expect(published).toHaveLength(1);
    });
  });

  it('number the steps of each version 1..n', () => {
    FIXTURE_PROCEDURE_VERSIONS.forEach((version) => {
      expect(version.steps.map((step) => step.order)).toEqual(
        version.steps.map((_, index) => index + 1),
      );
    });
  });

  it('include a Ventas procedure with v1 and v2 and an Operaciones procedure', () => {
    const versionsOf = (procedureId: string) =>
      FIXTURE_PROCEDURE_VERSIONS.filter((v) => v.procedureId === procedureId);

    expect(versionsOf(PROCEDURE_IDS.cierreDeCaja)).toHaveLength(2);
    expect(versionsOf(PROCEDURE_IDS.recepcionMercaderia)).toHaveLength(1);
    expect(PROCEDURE_AREAS).toEqual({
      [PROCEDURE_IDS.cierreDeCaja]: [AREA_IDS.ventas],
      [PROCEDURE_IDS.recepcionMercaderia]: [AREA_IDS.operaciones],
    });
  });

  it('keep the areas on the procedure, not on each version', () => {
    FIXTURE_PROCEDURE_VERSIONS.forEach((version) =>
      expect(version).not.toHaveProperty('areaIds'),
    );
  });
});
