/* Mica's real catalog against the test database: what executions add to it for HU33
(findPublishedAfter). The data are created here and only these rows are deleted */

import { randomUUID } from 'node:crypto';
import { AREA_IDS } from '../../src/documents/adapters/fixtures';
import { PrismaProceduresCatalog } from '../../src/procedures/adapters/prisma-procedures-catalog';
import { PrismaService } from '../../src/prisma/prisma.service';

type VersionStatus = 'DRAFT' | 'PUBLISHED' | 'SUPERSEDED';

interface SeedVersion {
  versionNumber: number;
  status: VersionStatus;
  isCritical?: boolean;
  changeSummary?: string;
  publishedAt?: Date;
}

const OWNER = '0b000000-0000-4000-8000-000000000001';

describe('PrismaProceduresCatalog.findPublishedAfter (integration, HU33)', () => {
  let prisma: PrismaService;
  let catalog: PrismaProceduresCatalog;
  const created: string[] = [];

  // A procedure in Ventas with the given versions, one step each. Returns the version ids
  // in the same order.
  async function seed(versions: SeedVersion[]): Promise<string[]> {
    const procedureId = randomUUID();
    created.push(procedureId);
    const versionIds = versions.map(() => randomUUID());
    await prisma.procedure.create({
      data: {
        id: procedureId,
        ownerId: OWNER,
        areas: { create: [{ areaId: AREA_IDS.ventas }] },
        versions: {
          create: versions.map((v, i) => ({
            id: versionIds[i],
            versionNumber: v.versionNumber,
            status: v.status,
            title: 'Cierre de caja',
            createdById: OWNER,
            isCritical: v.isCritical ?? false,
            changeSummary: v.changeSummary ?? null,
            publishedAt: v.status === 'DRAFT' ? null : (v.publishedAt ?? null),
            publishedById: v.status === 'DRAFT' ? null : OWNER,
            steps: { create: [{ stepOrder: 1, title: 'Contar' }] },
          })),
        },
      },
    });
    return versionIds;
  }

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    catalog = new PrismaProceduresCatalog(prisma);
  });

  afterEach(async () => {
    // Versions, steps and areas go with the procedure (onDelete: Cascade).
    await prisma.procedure.deleteMany({ where: { id: { in: created } } });
    created.length = 0;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('gives the versions published after one, oldest first, with their critical change', async () => {
    const v2At = new Date('2026-11-01T12:00:00.000Z');
    const v3At = new Date('2026-11-10T12:00:00.000Z');
    const [v1, v2, v3] = await seed([
      { versionNumber: 1, status: 'SUPERSEDED' },
      {
        versionNumber: 2,
        status: 'SUPERSEDED',
        isCritical: true,
        changeSummary: 'Cambia el límite de caja',
        publishedAt: v2At,
      },
      { versionNumber: 3, status: 'PUBLISHED', publishedAt: v3At },
      { versionNumber: 4, status: 'DRAFT' },
    ]);

    await expect(catalog.findPublishedAfter(v1)).resolves.toEqual([
      {
        versionId: v2,
        versionNumber: 2,
        isCritical: true,
        changeSummary: 'Cambia el límite de caja',
        publishedAt: v2At,
      },
      {
        versionId: v3,
        versionNumber: 3,
        isCritical: false,
        changeSummary: null,
        publishedAt: v3At,
      },
    ]);
  });

  it('the current version has nothing published after it: a draft does not count', async () => {
    const [, v2] = await seed([
      { versionNumber: 1, status: 'SUPERSEDED' },
      { versionNumber: 2, status: 'PUBLISHED' },
      { versionNumber: 3, status: 'DRAFT' },
    ]);

    await expect(catalog.findPublishedAfter(v2)).resolves.toEqual([]);
  });

  it('only versions of the same procedure', async () => {
    const [v1] = await seed([{ versionNumber: 1, status: 'PUBLISHED' }]);
    await seed([
      { versionNumber: 1, status: 'SUPERSEDED' },
      { versionNumber: 2, status: 'PUBLISHED' },
    ]);

    await expect(catalog.findPublishedAfter(v1)).resolves.toEqual([]);
  });

  it('a version that does not exist gives an empty list', async () => {
    await expect(catalog.findPublishedAfter(randomUUID())).resolves.toEqual([]);
  });
});
