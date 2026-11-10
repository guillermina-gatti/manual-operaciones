import { Prisma } from '../generated/prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import { PrismaVersionsRepository } from './prisma-versions.repository';
import { ProceduresRepositoryUnavailableError } from './procedures.repository';

const PROCEDURE_ID = '1a000000-0000-4000-8000-000000000001';
const VERSION_ID = '1b000000-0000-4000-8000-000000000002';
const PREVIOUS_ID = '1b000000-0000-4000-8000-000000000001';
const ADMIN_ID = '0b000000-0000-4000-8000-000000000001';
const T0 = new Date('2026-11-01T10:00:00.000Z');

const knownError = (code: string) =>
  new Prisma.PrismaClientKnownRequestError(`Prisma error ${code}`, {
    code,
    clientVersion: '7.10.0',
  });

// A version as Prisma returns it with the step count.
const versionRow = (overrides: Record<string, unknown> = {}) => ({
  id: VERSION_ID,
  procedureId: PROCEDURE_ID,
  versionNumber: 2,
  status: 'DRAFT',
  title: 'Cierre de caja',
  description: null,
  createdById: ADMIN_ID,
  createdAt: T0,
  updatedAt: T0,
  publishedAt: null,
  publishedById: null,
  isCritical: false,
  changeSummary: null,
  _count: { steps: 2 },
  ...overrides,
});

describe('PrismaVersionsRepository', () => {
  let prisma: {
    procedure: { findUnique: jest.Mock };
    procedureVersion: { findMany: jest.Mock; count: jest.Mock; findFirst: jest.Mock };
  };
  let repository: PrismaVersionsRepository;

  beforeEach(() => {
    prisma = {
      procedure: { findUnique: jest.fn() },
      procedureVersion: { findMany: jest.fn(), count: jest.fn(), findFirst: jest.fn() },
    };
    repository = new PrismaVersionsRepository(prisma as unknown as PrismaService);
  });

  describe('list', () => {
    it('R8: gives the page of versions, newest first, with the total', async () => {
      prisma.procedure.findUnique.mockResolvedValue({ id: PROCEDURE_ID });
      prisma.procedureVersion.findMany.mockResolvedValue([
        versionRow({ id: VERSION_ID, versionNumber: 2 }),
        versionRow({
          id: PREVIOUS_ID,
          versionNumber: 1,
          status: 'PUBLISHED',
          publishedAt: T0,
          publishedById: ADMIN_ID,
        }),
      ]);
      prisma.procedureVersion.count.mockResolvedValue(5);

      const page = await repository.list(PROCEDURE_ID, 2, 2);

      expect(prisma.procedureVersion.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { procedureId: PROCEDURE_ID },
          orderBy: { versionNumber: 'desc' },
          skip: 2,
          take: 2,
        }),
      );
      expect(page?.total).toBe(5);
      expect(page?.data.map((version) => version.versionNumber)).toEqual([2, 1]);
      expect(page?.data[1]).toMatchObject({ publishedById: ADMIN_ID, stepCount: 2 });
    });

    it('R8: a procedure that does not exist is null', async () => {
      prisma.procedure.findUnique.mockResolvedValue(null);

      await expect(repository.list(PROCEDURE_ID, 1, 20)).resolves.toBeNull();
      expect(prisma.procedureVersion.findMany).not.toHaveBeenCalled();
    });

    it('does not show fields that are internal', async () => {
      prisma.procedure.findUnique.mockResolvedValue({ id: PROCEDURE_ID });
      prisma.procedureVersion.findMany.mockResolvedValue([versionRow()]);
      prisma.procedureVersion.count.mockResolvedValue(1);

      const page = await repository.list(PROCEDURE_ID, 1, 20);

      expect(Object.keys(page!.data[0])).not.toContain('createdById');
    });

    it('a database that does not answer is a ProceduresRepositoryUnavailableError', async () => {
      prisma.procedure.findUnique.mockRejectedValue(knownError('P1001'));

      await expect(repository.list(PROCEDURE_ID, 1, 20)).rejects.toBeInstanceOf(
        ProceduresRepositoryUnavailableError,
      );
    });
  });

  describe('findForCompare', () => {
    const FROM = PREVIOUS_ID;
    const rows = () => [
      versionRow({
        id: VERSION_ID,
        versionNumber: 2,
        steps: [{ id: 'n1', stepOrder: 1, title: 'Contar', description: '', stepKey: 'k1' }],
      }),
      versionRow({
        id: FROM,
        versionNumber: 1,
        status: 'PUBLISHED',
        steps: [
          { id: 'o1', stepOrder: 1, title: 'Contar', description: 'Todo', stepKey: 'k1' },
          { id: 'o2', stepOrder: 2, title: 'Cerrar', description: '', stepKey: 'k2' },
        ],
      }),
    ];

    it('R10: gives the two versions, from and to as asked, with their steps and step keys', async () => {
      prisma.procedureVersion.findMany.mockResolvedValue(rows());

      const found = await repository.findForCompare(PROCEDURE_ID, FROM, VERSION_ID);

      expect(found?.from).toMatchObject({ id: FROM, versionNumber: 1, status: 'PUBLISHED' });
      expect(found?.to).toMatchObject({ id: VERSION_ID, versionNumber: 2, status: 'DRAFT' });
      expect(found?.from.steps).toEqual([
        { key: 'k1', id: 'o1', order: 1, title: 'Contar', description: 'Todo' },
        { key: 'k2', id: 'o2', order: 2, title: 'Cerrar', description: '' },
      ]);
    });

    it('looks for both ids inside the procedure, so a version of another procedure is not found', async () => {
      prisma.procedureVersion.findMany.mockResolvedValue(rows());

      await repository.findForCompare(PROCEDURE_ID, FROM, VERSION_ID);

      expect(prisma.procedureVersion.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { procedureId: PROCEDURE_ID, id: { in: [FROM, VERSION_ID] } },
        }),
      );
    });

    it.each([['only one'], ['none']])('R10: if %s of the two is in that procedure, it is null', async (case_) => {
      prisma.procedureVersion.findMany.mockResolvedValue(case_ === 'none' ? [] : rows().slice(0, 1));

      await expect(repository.findForCompare(PROCEDURE_ID, FROM, VERSION_ID)).resolves.toBeNull();
    });

    it('a database that does not answer is a ProceduresRepositoryUnavailableError', async () => {
      prisma.procedureVersion.findMany.mockRejectedValue(knownError('P1001'));

      await expect(repository.findForCompare(PROCEDURE_ID, FROM, VERSION_ID)).rejects.toBeInstanceOf(
        ProceduresRepositoryUnavailableError,
      );
    });
  });

  describe('findVersion', () => {
    it('R9: gives the version with its steps in order', async () => {
      prisma.procedureVersion.findFirst.mockResolvedValue(
        versionRow({
          status: 'SUPERSEDED',
          description: 'Al final del turno',
          steps: [
            { id: 's1', stepOrder: 1, title: 'Contar', description: '' },
            { id: 's2', stepOrder: 2, title: 'Comparar', description: 'Con el reporte' },
          ],
        }),
      );

      const version = await repository.findVersion(PROCEDURE_ID, VERSION_ID);

      expect(prisma.procedureVersion.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: VERSION_ID, procedureId: PROCEDURE_ID } }),
      );
      expect(version).toMatchObject({
        id: VERSION_ID,
        status: 'SUPERSEDED',
        description: 'Al final del turno',
        steps: [
          { id: 's1', order: 1, title: 'Contar', description: '' },
          { id: 's2', order: 2, title: 'Comparar', description: 'Con el reporte' },
        ],
      });
    });

    it('R9: a version that is not in that procedure is null', async () => {
      prisma.procedureVersion.findFirst.mockResolvedValue(null);

      await expect(repository.findVersion(PROCEDURE_ID, VERSION_ID)).resolves.toBeNull();
    });

    it('a database that does not answer is a ProceduresRepositoryUnavailableError', async () => {
      prisma.procedureVersion.findFirst.mockRejectedValue(knownError('P1008'));

      await expect(repository.findVersion(PROCEDURE_ID, VERSION_ID)).rejects.toBeInstanceOf(
        ProceduresRepositoryUnavailableError,
      );
    });
  });
});
