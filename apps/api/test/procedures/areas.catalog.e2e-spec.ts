/* The areas catalog of procedures against the test database (spec 006, R11, P13) */

import { AREA_IDS } from '../../src/documents/adapters/fixtures';
import { PrismaProcedureAreasCatalog } from '../../src/procedures/prisma-procedure-areas.catalog';
import { createArea, deleteAreas } from './area-helpers';
import { ProceduresTestApp, createProceduresTestApp } from './app-helpers';

describe('PrismaProcedureAreasCatalog (integration)', () => {
  let t: ProceduresTestApp;
  let catalog: PrismaProcedureAreasCatalog;
  const created: string[] = [];

  beforeAll(async () => {
    t = await createProceduresTestApp();
    catalog = new PrismaProcedureAreasCatalog(t.prisma);
  });

  afterEach(async () => {
    await deleteAreas(t.prisma, created.splice(0));
  });

  afterAll(async () => {
    await t.app.close();
  });

  it('P13: tells an active area from an inactive one and leaves out the one that does not exist', async () => {
    const inactive = await createArea(t.prisma, false);
    created.push(inactive);
    const missing = '0a000000-0000-4000-8000-0000000000ff';

    const states = await catalog.findStates([
      AREA_IDS.ventas,
      inactive,
      missing,
    ]);

    expect(states).toHaveLength(2);
    expect(states).toEqual(
      expect.arrayContaining([
        { id: AREA_IDS.ventas, isActive: true },
        { id: inactive, isActive: false },
      ]),
    );
  });
});
