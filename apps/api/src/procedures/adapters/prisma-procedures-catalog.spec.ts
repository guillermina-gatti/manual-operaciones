import { CatalogUnavailableError } from '../../executions/ports/procedures-catalog';
import { Prisma } from '../../generated/prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { PrismaProceduresCatalog } from './prisma-procedures-catalog';

const PROCEDURE_ID = '1a000000-0000-4000-8000-000000000001';
const VERSION_ID = '1b000000-0000-4000-8000-000000000002';
const VENTAS = '0a000000-0000-4000-8000-000000000001';
const OPERACIONES = '0a000000-0000-4000-8000-000000000002';

const knownError = (code: string) =>
  new Prisma.PrismaClientKnownRequestError(`Prisma error ${code}`, {
    code,
    clientVersion: '7.10.0',
  });

// A version as Prisma returns it with its steps and the areas of its procedure.
const versionRow = (overrides: Record<string, unknown> = {}) => ({
  id: VERSION_ID,
  procedureId: PROCEDURE_ID,
  title: 'Cierre de caja',
  steps: [
    { id: 's1', stepOrder: 1, title: 'Contar' },
    { id: 's2', stepOrder: 2, title: 'Comparar' },
  ],
  procedure: { areas: [{ areaId: OPERACIONES }, { areaId: VENTAS }] },
  ...overrides,
});

describe('PrismaProceduresCatalog (spec 015, R12)', () => {
  let prisma: { procedureVersion: { findFirst: jest.Mock; findUnique: jest.Mock } };
  let catalog: PrismaProceduresCatalog;

  beforeEach(() => {
    prisma = { procedureVersion: { findFirst: jest.fn(), findUnique: jest.fn() } };
    catalog = new PrismaProceduresCatalog(prisma as unknown as PrismaService);
  });

  describe('findPublished', () => {
    it('E21: gives the current version with its steps in order and the current areas', async () => {
      prisma.procedureVersion.findFirst.mockResolvedValue(versionRow());

      await expect(catalog.findPublished(PROCEDURE_ID)).resolves.toEqual({
        procedureId: PROCEDURE_ID,
        versionId: VERSION_ID,
        areaIds: [VENTAS, OPERACIONES],
        steps: [
          { id: 's1', order: 1, title: 'Contar' },
          { id: 's2', order: 2, title: 'Comparar' },
        ],
      });
    });

    it('asks for the most recent PUBLISHED version of that procedure, with its steps by order', async () => {
      prisma.procedureVersion.findFirst.mockResolvedValue(versionRow());

      await catalog.findPublished(PROCEDURE_ID);

      expect(prisma.procedureVersion.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { procedureId: PROCEDURE_ID, status: 'PUBLISHED' },
          orderBy: { versionNumber: 'desc' },
        }),
      );
    });

    it('E22: a procedure without a PUBLISHED version is null', async () => {
      prisma.procedureVersion.findFirst.mockResolvedValue(null);

      await expect(catalog.findPublished(PROCEDURE_ID)).resolves.toBeNull();
    });

    it('E22: a PUBLISHED version without steps counts as not published', async () => {
      prisma.procedureVersion.findFirst.mockResolvedValue(versionRow({ steps: [] }));

      await expect(catalog.findPublished(PROCEDURE_ID)).resolves.toBeNull();
    });

    it('a procedure without areas has an empty list of areas', async () => {
      prisma.procedureVersion.findFirst.mockResolvedValue(versionRow({ procedure: { areas: [] } }));

      await expect(catalog.findPublished(PROCEDURE_ID)).resolves.toMatchObject({ areaIds: [] });
    });
  });

  describe('findVersion', () => {
    it('E21: gives a SUPERSEDED version with its steps, as it is', async () => {
      prisma.procedureVersion.findUnique.mockResolvedValue(versionRow());

      await expect(catalog.findVersion(VERSION_ID)).resolves.toEqual({
        procedureId: PROCEDURE_ID,
        versionId: VERSION_ID,
        areaIds: [VENTAS, OPERACIONES],
        steps: [
          { id: 's1', order: 1, title: 'Contar' },
          { id: 's2', order: 2, title: 'Comparar' },
        ],
      });
      expect(prisma.procedureVersion.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: VERSION_ID } }),
      );
    });

    it('E21: an id that does not exist is null', async () => {
      prisma.procedureVersion.findUnique.mockResolvedValue(null);

      await expect(catalog.findVersion(VERSION_ID)).resolves.toBeNull();
    });

    it('does not give the description of the steps nor any other field of the tables', async () => {
      prisma.procedureVersion.findUnique.mockResolvedValue(
        versionRow({ steps: [{ id: 's1', stepOrder: 1, title: 'Contar', description: 'x', stepKey: 'k' }] }),
      );

      const version = await catalog.findVersion(VERSION_ID);

      expect(version?.steps).toEqual([{ id: 's1', order: 1, title: 'Contar' }]);
    });
  });

  describe('E23: the title of the procedure', () => {
    // Pending: Mayra adds title to CatalogProcedureVersion; until then the adapter does not send it.
    it('does not send a title yet, because the port does not have one', async () => {
      prisma.procedureVersion.findUnique.mockResolvedValue(versionRow());

      const version = await catalog.findVersion(VERSION_ID);

      expect(Object.keys(version ?? {}).sort()).toEqual(['areaIds', 'procedureId', 'steps', 'versionId']);
    });
  });

  describe('a database that does not answer', () => {
    it.each([['findPublished'], ['findVersion']] as const)(
      '%s throws CatalogUnavailableError, with the cause',
      async (method) => {
        const cause = knownError('P1001');
        prisma.procedureVersion.findFirst.mockRejectedValue(cause);
        prisma.procedureVersion.findUnique.mockRejectedValue(cause);

        const error = await catalog[method](PROCEDURE_ID).catch((e: unknown) => e);

        expect(error).toBeInstanceOf(CatalogUnavailableError);
        expect((error as CatalogUnavailableError).cause).toBe(cause);
      },
    );

    it('an error that is not about the connection passes unchanged', async () => {
      const other = new Error('boom');
      prisma.procedureVersion.findUnique.mockRejectedValue(other);

      await expect(catalog.findVersion(VERSION_ID)).rejects.toBe(other);
    });
  });
});
