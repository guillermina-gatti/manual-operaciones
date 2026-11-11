import type { PrismaClient } from '../../generated/prisma/client';
import { DEMO_ADMIN_ID, DEMO_AREA_IDS } from './demo-ids';
import { DEMO_PROCEDURES } from './demo-procedures';
import { checkPrerequisites, findForeignProcedures } from './demo-preflight';

function fakePrisma(overrides: {
  admin?: number;
  areaIds?: string[];
  versions?: unknown[];
}) {
  const user = { count: jest.fn().mockResolvedValue(overrides.admin ?? 1) };
  const area = {
    findMany: jest.fn().mockResolvedValue(
      (overrides.areaIds ?? Object.values(DEMO_AREA_IDS)).map((id) => ({
        id,
      })),
    ),
  };
  const procedureVersion = {
    findMany: jest.fn().mockResolvedValue(overrides.versions ?? []),
  };
  return {
    prisma: { user, area, procedureVersion } as unknown as PrismaClient,
    user,
    area,
    procedureVersion,
  };
}

describe('checkPrerequisites', () => {
  it('passes when the admin and both areas exist', async () => {
    // Arrange
    const { prisma, user } = fakePrisma({});
    // Act
    await checkPrerequisites(prisma);
    // Assert
    expect(user.count).toHaveBeenCalledWith({ where: { id: DEMO_ADMIN_ID } });
  });

  it('fails naming the missing admin', async () => {
    const { prisma } = fakePrisma({ admin: 0 });
    await expect(checkPrerequisites(prisma)).rejects.toThrow(/admin/i);
  });

  it('fails naming the missing area', async () => {
    const { prisma } = fakePrisma({ areaIds: [DEMO_AREA_IDS.ventas] });
    await expect(checkPrerequisites(prisma)).rejects.toThrow(
      DEMO_AREA_IDS.operaciones,
    );
  });
});

describe('findForeignProcedures', () => {
  const [cierre] = DEMO_PROCEDURES;
  const seedRows = cierre.versions.map((v) => ({
    id: v.id,
    procedureId: cierre.id,
    steps: v.steps.map((s) => ({ id: s.id })),
  }));

  it('returns nothing on an empty database', async () => {
    const { prisma } = fakePrisma({});
    expect(await findForeignProcedures(prisma, DEMO_PROCEDURES)).toEqual(
      new Set(),
    );
  });

  it('returns nothing when the rows are the ones of the seed', async () => {
    const { prisma } = fakePrisma({ versions: seedRows });
    expect(await findForeignProcedures(prisma, DEMO_PROCEDURES)).toEqual(
      new Set(),
    );
  });

  it('skips a procedure that has a version that is not from the seed', async () => {
    const extra = {
      id: 'ffffffff-0000-4000-8000-000000000001',
      procedureId: cierre.id,
      steps: [],
    };
    const { prisma } = fakePrisma({ versions: [...seedRows, extra] });
    expect(await findForeignProcedures(prisma, DEMO_PROCEDURES)).toEqual(
      new Set([cierre.id]),
    );
  });

  it('skips a procedure that has a step that is not from the seed', async () => {
    const [first, ...rest] = seedRows;
    const withExtra = {
      ...first,
      steps: [...first.steps, { id: 'ffffffff-0000-4000-8000-000000000002' }],
    };
    const { prisma } = fakePrisma({ versions: [withExtra, ...rest] });
    expect(await findForeignProcedures(prisma, DEMO_PROCEDURES)).toEqual(
      new Set([cierre.id]),
    );
  });
});
