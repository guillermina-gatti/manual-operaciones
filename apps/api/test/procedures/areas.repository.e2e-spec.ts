/* The Prisma area assignment against real PostgreSQL: full replacement, untouched versions and steps, and the lock */

import { AREA_IDS } from '../../src/documents/adapters/fixtures';
import { PrismaProceduresRepository } from '../../src/procedures/prisma-procedures.repository';
import { PrismaService } from '../../src/prisma/prisma.service';
import { cleanProcedures, seedProcedure } from './helpers';

const { ventas: VENTAS, operaciones: OPERACIONES } = AREA_IDS;
const MISSING = '1a000000-0000-4000-8000-000000000099';

describe('Procedures repository: areas (integration)', () => {
  let prisma: PrismaService;
  let repository: PrismaProceduresRepository;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    repository = new PrismaProceduresRepository(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await cleanProcedures(prisma);
  });

  const storedAreas = async (procedureId: string) =>
    (
      await prisma.procedureArea.findMany({
        where: { procedureId },
        orderBy: { areaId: 'asc' },
      })
    ).map((row) => row.areaId);

  const versionsWithSteps = (procedureId: string) =>
    prisma.procedureVersion.findMany({
      where: { procedureId },
      orderBy: { versionNumber: 'asc' },
      include: { steps: { orderBy: { stepOrder: 'asc' } } },
    });

  it('E17: assigns two areas and then reassigns only one, replacing the set', async () => {
    const { procedureId } = await seedProcedure(prisma, {
      versions: [{ versionNumber: 1, status: 'DRAFT' }],
    });

    await expect(
      repository.setAreas(procedureId, [VENTAS, OPERACIONES]),
    ).resolves.toEqual([VENTAS, OPERACIONES]);
    expect(await storedAreas(procedureId)).toEqual([VENTAS, OPERACIONES]);

    await expect(repository.setAreas(procedureId, [VENTAS])).resolves.toEqual([
      VENTAS,
    ]);
    expect(await storedAreas(procedureId)).toEqual([VENTAS]);
  });

  it('R11: an empty set leaves the procedure without areas', async () => {
    const { procedureId } = await seedProcedure(prisma, {
      areaIds: [VENTAS],
      versions: [{ versionNumber: 1, status: 'DRAFT' }],
    });

    await expect(repository.setAreas(procedureId, [])).resolves.toEqual([]);
    expect(await storedAreas(procedureId)).toEqual([]);
  });

  it('is null for a missing procedure and writes no area', async () => {
    await expect(repository.setAreas(MISSING, [VENTAS])).resolves.toBeNull();
    expect(await prisma.procedureArea.count()).toBe(0);
  });

  it('R11: works with a PUBLISHED version and an open draft, and leaves versions and steps as they were', async () => {
    const seeded = await seedProcedure(prisma, {
      areaIds: [VENTAS],
      versions: [
        { versionNumber: 1, status: 'PUBLISHED', stepTitles: ['A', 'B'] },
        { versionNumber: 2, status: 'DRAFT', stepTitles: ['A', 'B', 'C'] },
      ],
    });
    const before = await versionsWithSteps(seeded.procedureId);

    await repository.setAreas(seeded.procedureId, [OPERACIONES]);

    expect(await versionsWithSteps(seeded.procedureId)).toEqual(before);
    expect(await storedAreas(seeded.procedureId)).toEqual([OPERACIONES]);
  });

  it('D15: two simultaneous assignments end with one of the two complete sets', async () => {
    const { procedureId } = await seedProcedure(prisma, {
      versions: [{ versionNumber: 1, status: 'DRAFT' }],
    });

    await Promise.all([
      repository.setAreas(procedureId, [VENTAS]),
      repository.setAreas(procedureId, [VENTAS, OPERACIONES]),
    ]);

    expect([[VENTAS], [VENTAS, OPERACIONES]]).toContainEqual(
      await storedAreas(procedureId),
    );
  });
});
