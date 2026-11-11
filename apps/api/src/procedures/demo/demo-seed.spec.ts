import type { PrismaClient } from '../../generated/prisma/client';
import { DEMO_AREA_IDS } from './demo-ids';
import { DEMO_PROCEDURES } from './demo-procedures';
import { seedDemoProcedures } from './demo-seed';

function fakePrisma(options: { admin?: number; versions?: unknown[] } = {}) {
  const ok = () => jest.fn().mockResolvedValue({});
  const db = {
    user: { count: jest.fn().mockResolvedValue(options.admin ?? 1) },
    area: {
      findMany: jest
        .fn()
        .mockResolvedValue(Object.values(DEMO_AREA_IDS).map((id) => ({ id }))),
    },
    procedureVersion: {
      findMany: jest.fn().mockResolvedValue(options.versions ?? []),
      upsert: ok(),
    },
    procedure: { upsert: ok() },
    procedureArea: { deleteMany: ok(), createMany: ok() },
    step: { upsert: ok() },
    $transaction: jest.fn().mockResolvedValue([]),
  };
  return { db, prisma: db as unknown as PrismaClient };
}

describe('seedDemoProcedures', () => {
  it('writes the 8 procedures in a single transaction', async () => {
    // Arrange
    const { db, prisma } = fakePrisma();
    // Act
    const result = await seedDemoProcedures(prisma, jest.fn());
    // Assert
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(db.procedure.upsert).toHaveBeenCalledTimes(8);
    expect(result).toEqual({ written: 8, skipped: [] });
  });

  it('writes nothing when the admin of the A pair is missing', async () => {
    const { db, prisma } = fakePrisma({ admin: 0 });
    await expect(seedDemoProcedures(prisma, jest.fn())).rejects.toThrow(
      /admin/i,
    );
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(db.procedure.upsert).not.toHaveBeenCalled();
  });

  it('skips a procedure with versions that are not from the seed and warns', async () => {
    // Arrange
    const [cierre] = DEMO_PROCEDURES;
    const alien = {
      id: 'ffffffff-0000-4000-8000-000000000001',
      procedureId: cierre.id,
      steps: [],
    };
    const { db, prisma } = fakePrisma({ versions: [alien] });
    const warn = jest.fn();
    // Act
    const result = await seedDemoProcedures(prisma, warn);
    // Assert
    expect(result).toEqual({ written: 7, skipped: [cierre.id] });
    expect(db.procedure.upsert).toHaveBeenCalledTimes(7);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining(cierre.id));
  });
});
