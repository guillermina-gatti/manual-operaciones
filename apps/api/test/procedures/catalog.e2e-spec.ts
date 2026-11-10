/* The real catalog of executions against the test database (spec 015, R12: E19, E21, E22) */

import { randomUUID } from 'node:crypto';
import { AREA_IDS } from '../../src/documents/adapters/fixtures';
import { PrismaProceduresCatalog } from '../../src/procedures/adapters/prisma-procedures-catalog';
import { PrismaService } from '../../src/prisma/prisma.service';
import { cleanProcedures, seedProcedure } from './helpers';

describe('PrismaProceduresCatalog (integration)', () => {
  let prisma: PrismaService;
  let catalog: PrismaProceduresCatalog;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    catalog = new PrismaProceduresCatalog(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await cleanProcedures(prisma);
  });

  // Version 1 SUPERSEDED, version 2 PUBLISHED with two steps, and a draft 3, in Ventas.
  const published = () =>
    seedProcedure(prisma, {
      areaIds: [AREA_IDS.ventas],
      versions: [
        { versionNumber: 1, status: 'SUPERSEDED', stepTitles: ['Contar'] },
        { versionNumber: 2, status: 'PUBLISHED', stepTitles: ['Contar', 'Comparar'] },
        { versionNumber: 3, status: 'DRAFT', stepTitles: ['Contar', 'Comparar', 'Cerrar'] },
      ],
    });

  it('E21: findPublished gives the PUBLISHED version with its steps in order and the areas', async () => {
    const { procedureId, versionIds, stepIds } = await published();

    await expect(catalog.findPublished(procedureId)).resolves.toEqual({
      procedureId,
      versionId: versionIds[1],
      areaIds: [AREA_IDS.ventas],
      steps: [
        { id: stepIds[1][0], order: 1, title: 'Contar' },
        { id: stepIds[1][1], order: 2, title: 'Comparar' },
      ],
    });
  });

  it('E19 and E21: findVersion gives a SUPERSEDED version with its own steps', async () => {
    const { procedureId, versionIds, stepIds } = await published();

    await expect(catalog.findVersion(versionIds[0])).resolves.toEqual({
      procedureId,
      versionId: versionIds[0],
      areaIds: [AREA_IDS.ventas],
      steps: [{ id: stepIds[0][0], order: 1, title: 'Contar' }],
    });
  });

  it('the areas are the current ones, also for an old version', async () => {
    const { procedureId, versionIds } = await published();
    await prisma.procedureArea.deleteMany({ where: { procedureId } });
    await prisma.procedureArea.create({ data: { procedureId, areaId: AREA_IDS.operaciones } });

    const old = await catalog.findVersion(versionIds[0]);
    const current = await catalog.findPublished(procedureId);

    expect(old?.areaIds).toEqual([AREA_IDS.operaciones]);
    expect(current?.areaIds).toEqual([AREA_IDS.operaciones]);
  });

  it('E22: a procedure with only a draft, or with a PUBLISHED version without steps, is null', async () => {
    const draft = await seedProcedure(prisma, {
      areaIds: [AREA_IDS.ventas],
      versions: [{ versionNumber: 1, status: 'DRAFT', stepTitles: ['Contar'] }],
    });
    const empty = await seedProcedure(prisma, {
      areaIds: [AREA_IDS.ventas],
      versions: [{ versionNumber: 1, status: 'PUBLISHED' }],
    });

    await expect(catalog.findPublished(draft.procedureId)).resolves.toBeNull();
    await expect(catalog.findPublished(empty.procedureId)).resolves.toBeNull();
  });

  it('E21: ids that do not exist are null', async () => {
    await expect(catalog.findPublished(randomUUID())).resolves.toBeNull();
    await expect(catalog.findVersion(randomUUID())).resolves.toBeNull();
  });
});
