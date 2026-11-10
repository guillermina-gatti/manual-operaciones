import { Prisma } from '../generated/prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import { PrismaVersionsRepository } from './prisma-versions.repository';
import { ProceduresRepositoryUnavailableError } from './procedures.repository';
import type { PublishData } from './versions.repository';

const PROCEDURE_ID = '1a000000-0000-4000-8000-000000000001';
const VERSION_ID = '1b000000-0000-4000-8000-000000000002';
const PREVIOUS_ID = '1b000000-0000-4000-8000-000000000001';
const ADMIN_ID = '0b000000-0000-4000-8000-000000000001';
const T0 = new Date('2026-11-01T10:00:00.000Z');
const NOW = new Date('2026-11-10T12:00:00.000Z');

const knownError = (code: string, meta?: Record<string, unknown>) =>
  new Prisma.PrismaClientKnownRequestError(`Prisma error ${code}`, {
    code,
    clientVersion: '7.10.0',
    meta,
  });

// P2002 as the pg adapter reports it: the index name in driverAdapterError.
const uniqueViolation = (index: string) =>
  knownError('P2002', { driverAdapterError: { cause: { constraint: { index } } } });

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

const publishData: PublishData = {
  procedureId: PROCEDURE_ID,
  versionId: VERSION_ID,
  publishedById: ADMIN_ID,
  publishedAt: NOW,
  isCritical: false,
  changeSummary: null,
};

const clientMock = () => ({
  $queryRaw: jest.fn(),
  procedure: { findUnique: jest.fn() },
  procedureArea: { count: jest.fn() },
  procedureVersion: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
});

describe('PrismaVersionsRepository', () => {
  let prisma: ReturnType<typeof clientMock> & { $transaction: jest.Mock };
  let tx: ReturnType<typeof clientMock>;
  let repository: PrismaVersionsRepository;

  beforeEach(() => {
    tx = clientMock();
    prisma = {
      ...clientMock(),
      $transaction: jest.fn((fn: (client: unknown) => unknown) => Promise.resolve(fn(tx))),
    };
    repository = new PrismaVersionsRepository(prisma as unknown as PrismaService);
  });

  describe('publish', () => {
    // The procedure is found (locked), the version is a DRAFT with steps and the procedure has an area.
    const happyPath = () => {
      tx.$queryRaw.mockResolvedValue([{ id: PROCEDURE_ID }]);
      tx.procedureVersion.findFirst.mockResolvedValue({ status: 'DRAFT', _count: { steps: 2 } });
      tx.procedureArea.count.mockResolvedValue(1);
      tx.procedureVersion.updateMany.mockResolvedValue({ count: 1 });
      tx.procedureVersion.update.mockResolvedValue(
        versionRow({
          status: 'PUBLISHED',
          publishedAt: NOW,
          publishedById: ADMIN_ID,
        }),
      );
    };

    const expectNothingWritten = () => {
      expect(tx.procedureVersion.updateMany).not.toHaveBeenCalled();
      expect(tx.procedureVersion.update).not.toHaveBeenCalled();
    };

    it('R2: publishes the draft and gives back the version with who and when', async () => {
      happyPath();

      const result = await repository.publish(publishData);

      expect(tx.procedureVersion.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: VERSION_ID },
          data: {
            status: 'PUBLISHED',
            publishedAt: NOW,
            publishedById: ADMIN_ID,
            isCritical: false,
            changeSummary: null,
          },
        }),
      );
      expect(result).toEqual({
        ok: true,
        value: expect.objectContaining({
          id: VERSION_ID,
          status: 'PUBLISHED',
          publishedAt: NOW,
          publishedById: ADMIN_ID,
          stepCount: 2,
        }),
      });
    });

    it('R4: the PUBLISHED one becomes SUPERSEDED before the new one is published', async () => {
      happyPath();

      await repository.publish(publishData);

      expect(tx.procedureVersion.updateMany).toHaveBeenCalledWith({
        where: { procedureId: PROCEDURE_ID, status: 'PUBLISHED' },
        data: { status: 'SUPERSEDED' },
      });
      expect(tx.procedureVersion.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
        tx.procedureVersion.update.mock.invocationCallOrder[0],
      );
    });

    it('R5: saves the critical change and its summary', async () => {
      happyPath();

      await repository.publish({ ...publishData, isCritical: true, changeSummary: 'Cambia el límite' });

      expect(tx.procedureVersion.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ isCritical: true, changeSummary: 'Cambia el límite' }),
        }),
      );
    });

    it('looks for the version inside the procedure, so one of another procedure is not found', async () => {
      happyPath();

      await repository.publish(publishData);

      expect(tx.procedureVersion.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: VERSION_ID, procedureId: PROCEDURE_ID } }),
      );
    });

    it('R3: a procedure that does not exist is NOT_FOUND', async () => {
      tx.$queryRaw.mockResolvedValue([]);

      await expect(repository.publish(publishData)).resolves.toEqual({
        ok: false,
        reason: 'NOT_FOUND',
      });
      expectNothingWritten();
    });

    it('R3: a version that is not in the procedure is NOT_FOUND', async () => {
      happyPath();
      tx.procedureVersion.findFirst.mockResolvedValue(null);

      await expect(repository.publish(publishData)).resolves.toEqual({
        ok: false,
        reason: 'NOT_FOUND',
      });
      expectNothingWritten();
    });

    it.each([['PUBLISHED'], ['SUPERSEDED']])(
      'R3: a %s version is NOT_A_DRAFT and nothing changes',
      async (status) => {
        happyPath();
        tx.procedureVersion.findFirst.mockResolvedValue({ status, _count: { steps: 2 } });

        await expect(repository.publish(publishData)).resolves.toEqual({
          ok: false,
          reason: 'NOT_A_DRAFT',
        });
        expectNothingWritten();
      },
    );

    it('R3: a draft without steps is NO_STEPS and nothing changes', async () => {
      happyPath();
      tx.procedureVersion.findFirst.mockResolvedValue({ status: 'DRAFT', _count: { steps: 0 } });

      await expect(repository.publish(publishData)).resolves.toEqual({
        ok: false,
        reason: 'NO_STEPS',
      });
      expectNothingWritten();
    });

    it('R3: a procedure without areas is NO_AREAS and nothing changes', async () => {
      happyPath();
      tx.procedureArea.count.mockResolvedValue(0);

      await expect(repository.publish(publishData)).resolves.toEqual({
        ok: false,
        reason: 'NO_AREAS',
      });
      expectNothingWritten();
    });

    it('R3: with no steps and no areas it says NO_STEPS first', async () => {
      happyPath();
      tx.procedureVersion.findFirst.mockResolvedValue({ status: 'DRAFT', _count: { steps: 0 } });
      tx.procedureArea.count.mockResolvedValue(0);

      await expect(repository.publish(publishData)).resolves.toEqual({
        ok: false,
        reason: 'NO_STEPS',
      });
    });

    it('runs in a transaction with a timeout', async () => {
      happyPath();

      await repository.publish(publishData);

      expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
        timeout: 5000,
        maxWait: 2000,
      });
    });

    it('R4: if the database rejects a second PUBLISHED (the index), it is NOT_A_DRAFT', async () => {
      happyPath();
      tx.procedureVersion.update.mockRejectedValue(
        uniqueViolation('procedure_versions_one_published_idx'),
      );

      await expect(repository.publish(publishData)).resolves.toEqual({
        ok: false,
        reason: 'NOT_A_DRAFT',
      });
    });

    it('a unique violation of another index passes unchanged', async () => {
      happyPath();
      const other = uniqueViolation('procedure_versions_one_draft_idx');
      tx.procedureVersion.update.mockRejectedValue(other);

      await expect(repository.publish(publishData)).rejects.toBe(other);
    });

    it('E20: a database that does not answer is a ProceduresRepositoryUnavailableError', async () => {
      prisma.$transaction.mockRejectedValue(knownError('P2028'));

      await expect(repository.publish(publishData)).rejects.toBeInstanceOf(
        ProceduresRepositoryUnavailableError,
      );
    });
  });

  describe('list', () => {
    it('R8: gives the page of versions, newest first, with the total', async () => {
      prisma.procedure.findUnique.mockResolvedValue({ id: PROCEDURE_ID });
      prisma.procedureVersion.findMany.mockResolvedValue([
        versionRow({ id: VERSION_ID, versionNumber: 2 }),
        versionRow({ id: PREVIOUS_ID, versionNumber: 1, status: 'PUBLISHED', publishedAt: T0, publishedById: ADMIN_ID }),
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
