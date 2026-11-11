import type { PrismaClient } from '../../generated/prisma/client';
import { DEMO_ADMIN_ID, DEMO_AREA_IDS } from './demo-ids';
import { DEMO_PROCEDURES } from './demo-procedures';
import { buildOperations } from './demo-operations';

function fakePrisma() {
  const call = () => jest.fn().mockResolvedValue({});
  const db = {
    procedure: { upsert: call() },
    procedureArea: { deleteMany: call(), createMany: call() },
    procedureVersion: { upsert: call() },
    step: { upsert: call() },
  };
  return { db, prisma: db as unknown as PrismaClient };
}

const [cierre, , , , limpieza, , reclamos, inventario] = DEMO_PROCEDURES;

describe('buildOperations', () => {
  it('upserts the procedure with the admin as owner', () => {
    // Arrange
    const { db, prisma } = fakePrisma();
    // Act
    buildOperations(prisma, cierre);
    // Assert
    expect(db.procedure.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: cierre.id },
        create: expect.objectContaining({ ownerId: DEMO_ADMIN_ID }),
      }),
    );
  });

  it('replaces the areas with the ones of the procedure, in both areas for reclamos', () => {
    const { db, prisma } = fakePrisma();
    buildOperations(prisma, reclamos);
    expect(db.procedureArea.deleteMany).toHaveBeenCalledWith({
      where: { procedureId: reclamos.id },
    });
    expect(db.procedureArea.createMany).toHaveBeenCalledWith({
      data: [
        { procedureId: reclamos.id, areaId: DEMO_AREA_IDS.ventas },
        { procedureId: reclamos.id, areaId: DEMO_AREA_IDS.operaciones },
      ],
    });
  });

  it('upserts each version by its fixed id, published by the admin with fixed dates', () => {
    const { db, prisma } = fakePrisma();
    buildOperations(prisma, cierre);
    const [first, second] = db.procedureVersion.upsert.mock.calls.map(
      ([arg]: [{ create: Record<string, unknown>; where: unknown }]) => arg,
    );
    expect(first.where).toEqual({ id: cierre.versions[0].id });
    expect(second.create).toMatchObject({
      status: 'PUBLISHED',
      publishedById: DEMO_ADMIN_ID,
      createdById: DEMO_ADMIN_ID,
      isCritical: true,
      publishedAt: cierre.versions[1].publishedAt,
    });
  });

  it('upserts every step numbered from 1 with its stepKey', () => {
    const { db, prisma } = fakePrisma();
    buildOperations(prisma, limpieza);
    const total = limpieza.versions.reduce((n, v) => n + v.steps.length, 0);
    expect(db.step.upsert).toHaveBeenCalledTimes(total);
    expect(db.step.upsert.mock.calls[0][0].create).toMatchObject({
      procedureVersionId: limpieza.versions[0].id,
      stepOrder: 1,
      stepKey: limpieza.versions[0].steps[0].stepKey,
    });
  });

  it('leaves a draft without publication data', () => {
    const { db, prisma } = fakePrisma();
    buildOperations(prisma, inventario);
    expect(db.procedureVersion.upsert.mock.calls[0][0].create).toMatchObject({
      status: 'DRAFT',
      publishedAt: null,
      publishedById: null,
    });
  });
});
