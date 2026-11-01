import { PrismaService } from '../prisma/prisma.service';
import { PrismaProcedureAreasCatalog } from './prisma-procedure-areas.catalog';
import { ProceduresRepositoryUnavailableError } from './procedures.repository';

const VENTAS = '0a000000-0000-4000-8000-000000000001';
const INACTIVA = '0a000000-0000-4000-8000-000000000003';

describe('PrismaProcedureAreasCatalog', () => {
  let prisma: { area: { findMany: jest.Mock } };
  let catalog: PrismaProcedureAreasCatalog;

  beforeEach(() => {
    prisma = { area: { findMany: jest.fn() } };
    catalog = new PrismaProcedureAreasCatalog(
      prisma as unknown as PrismaService,
    );
  });

  describe('findStates', () => {
    it('reads only id and isActive of the areas asked for, without repeats', async () => {
      prisma.area.findMany.mockResolvedValue([
        { id: VENTAS, isActive: true },
        { id: INACTIVA, isActive: false },
      ]);

      await expect(
        catalog.findStates([VENTAS, INACTIVA, VENTAS]),
      ).resolves.toEqual([
        { id: VENTAS, isActive: true },
        { id: INACTIVA, isActive: false },
      ]);
      expect(prisma.area.findMany).toHaveBeenCalledWith({
        where: { id: { in: [VENTAS, INACTIVA] } },
        select: { id: true, isActive: true },
      });
    });

    it('does not query for an empty list', async () => {
      await expect(catalog.findStates([])).resolves.toEqual([]);
      expect(prisma.area.findMany).not.toHaveBeenCalled();
    });

    it('a database that does not answer becomes ProceduresRepositoryUnavailableError', async () => {
      prisma.area.findMany.mockRejectedValue(
        new Error('Connection terminated unexpectedly'),
      );

      await expect(catalog.findStates([VENTAS])).rejects.toBeInstanceOf(
        ProceduresRepositoryUnavailableError,
      );
    });

    it('any other error goes up as it is', async () => {
      const failure = new Error('boom');
      prisma.area.findMany.mockRejectedValue(failure);

      await expect(catalog.findStates([VENTAS])).rejects.toBe(failure);
    });
  });
});
