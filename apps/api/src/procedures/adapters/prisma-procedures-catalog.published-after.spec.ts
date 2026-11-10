// findPublishedAfter of the real catalog (HU33, executions): only what it adds to the adapter.
import { CatalogUnavailableError } from '../../executions/ports/procedures-catalog';
import { Prisma } from '../../generated/prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { PrismaProceduresCatalog } from './prisma-procedures-catalog';

const PROCEDURE_ID = '1a000000-0000-4000-8000-000000000001';
const V1 = '1b000000-0000-4000-8000-000000000001';
const V2 = '1b000000-0000-4000-8000-000000000002';
const V3 = '1b000000-0000-4000-8000-000000000004';
const PUBLISHED_AT = new Date('2026-11-10T12:00:00.000Z');

describe('PrismaProceduresCatalog.findPublishedAfter (HU33)', () => {
  let prisma: {
    procedureVersion: { findUnique: jest.Mock; findMany: jest.Mock };
  };
  let catalog: PrismaProceduresCatalog;

  beforeEach(() => {
    prisma = {
      procedureVersion: { findUnique: jest.fn(), findMany: jest.fn() },
    };
    catalog = new PrismaProceduresCatalog(prisma as unknown as PrismaService);
  });

  it('asks for the later versions of the same procedure that were published, oldest first', async () => {
    prisma.procedureVersion.findUnique.mockResolvedValue({
      procedureId: PROCEDURE_ID,
      versionNumber: 1,
    });
    prisma.procedureVersion.findMany.mockResolvedValue([]);

    await catalog.findPublishedAfter(V1);

    expect(prisma.procedureVersion.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: V1 } }),
    );
    expect(prisma.procedureVersion.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          procedureId: PROCEDURE_ID,
          versionNumber: { gt: 1 },
          status: { in: ['PUBLISHED', 'SUPERSEDED'] },
        },
        orderBy: { versionNumber: 'asc' },
      }),
    );
  });

  it('gives each one with its number, whether it was critical and its summary, field by field', async () => {
    prisma.procedureVersion.findUnique.mockResolvedValue({
      procedureId: PROCEDURE_ID,
      versionNumber: 1,
    });
    prisma.procedureVersion.findMany.mockResolvedValue([
      {
        id: V2,
        versionNumber: 2,
        isCritical: true,
        changeSummary: 'Cambia el límite de caja',
        publishedAt: PUBLISHED_AT,
        title: 'not mapped',
      },
      {
        id: V3,
        versionNumber: 3,
        isCritical: false,
        changeSummary: null,
        publishedAt: PUBLISHED_AT,
      },
    ]);

    await expect(catalog.findPublishedAfter(V1)).resolves.toEqual([
      {
        versionId: V2,
        versionNumber: 2,
        isCritical: true,
        changeSummary: 'Cambia el límite de caja',
        publishedAt: PUBLISHED_AT,
      },
      {
        versionId: V3,
        versionNumber: 3,
        isCritical: false,
        changeSummary: null,
        publishedAt: PUBLISHED_AT,
      },
    ]);
  });

  it('a version that does not exist gives an empty list, without asking for others', async () => {
    prisma.procedureVersion.findUnique.mockResolvedValue(null);

    await expect(catalog.findPublishedAfter(V1)).resolves.toEqual([]);
    expect(prisma.procedureVersion.findMany).not.toHaveBeenCalled();
  });

  it('a database that does not answer throws CatalogUnavailableError, with the cause', async () => {
    const cause = new Prisma.PrismaClientKnownRequestError('down', {
      code: 'P1001',
      clientVersion: '7.10.0',
    });
    prisma.procedureVersion.findUnique.mockRejectedValue(cause);

    const error = await catalog.findPublishedAfter(V1).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(CatalogUnavailableError);
    expect((error as CatalogUnavailableError).cause).toBe(cause);
  });
});
