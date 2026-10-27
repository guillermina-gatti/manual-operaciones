import { Prisma } from '../generated/prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import {
  DraftAlreadyExistsError,
  NoPublishedVersionError,
  ProceduresRepositoryUnavailableError,
} from './procedures.repository';
import type { NewDraft, NewProcedure } from './procedures.repository';
import { PrismaProceduresRepository } from './prisma-procedures.repository';

const PROCEDURE_ID = '1a000000-0000-4000-8000-000000000001';
const VERSION_ID = '1b000000-0000-4000-8000-000000000001';
const NEW_VERSION_ID = '1b000000-0000-4000-8000-000000000002';
const OWNER_ID = '0b000000-0000-4000-8000-000000000001';
const VENTAS = '0a000000-0000-4000-8000-000000000001';
const T0 = new Date('2026-10-27T10:00:00.000Z');

// A version as Prisma returns it with the step count.
const versionRow = (overrides: Record<string, unknown> = {}) => ({
  id: VERSION_ID,
  procedureId: PROCEDURE_ID,
  versionNumber: 1,
  status: 'DRAFT',
  title: 'Cierre de caja',
  description: null,
  createdById: OWNER_ID,
  createdAt: T0,
  updatedAt: T0,
  _count: { steps: 0 },
  ...overrides,
});

const procedureRow = (overrides: Record<string, unknown> = {}) => ({
  id: PROCEDURE_ID,
  ownerId: OWNER_ID,
  createdAt: T0,
  updatedAt: T0,
  areas: [{ areaId: VENTAS }],
  versions: [versionRow()],
  ...overrides,
});

const knownError = (code: string, meta?: Record<string, unknown>) =>
  new Prisma.PrismaClientKnownRequestError(`Prisma error ${code}`, {
    code,
    clientVersion: '7.10.0',
    meta,
  });

// P2002 as the pg adapter reports it: the index name in driverAdapterError.
const uniqueViolation = (index: string) =>
  knownError('P2002', {
    driverAdapterError: { cause: { constraint: { index } } },
  });

const newProcedure: NewProcedure = {
  id: PROCEDURE_ID,
  versionId: VERSION_ID,
  ownerId: OWNER_ID,
  title: 'Cierre de caja',
  description: null,
};

const newDraft: NewDraft = {
  procedureId: PROCEDURE_ID,
  versionId: NEW_VERSION_ID,
  createdById: OWNER_ID,
};

const clientMock = () => ({
  $queryRaw: jest.fn(),
  procedure: { create: jest.fn(), findUnique: jest.fn(), delete: jest.fn() },
  procedureVersion: {
    findFirst: jest.fn(),
    aggregate: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  },
});

describe('PrismaProceduresRepository', () => {
  let prisma: ReturnType<typeof clientMock> & { $transaction: jest.Mock };
  let txClient: ReturnType<typeof clientMock>;
  let repository: PrismaProceduresRepository;

  beforeEach(() => {
    txClient = clientMock();
    prisma = {
      ...clientMock(),
      $transaction: jest.fn((fn: (client: unknown) => unknown) =>
        Promise.resolve(fn(txClient)),
      ),
    };
    repository = new PrismaProceduresRepository(
      prisma as unknown as PrismaService,
    );
  });

  describe('create', () => {
    it('R2: inserts the procedure and its version 1 as a DRAFT in one statement', async () => {
      prisma.procedure.create.mockResolvedValue(procedureRow());

      const record = await repository.create(newProcedure);

      expect(prisma.procedure.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            id: PROCEDURE_ID,
            ownerId: OWNER_ID,
            versions: {
              create: {
                id: VERSION_ID,
                versionNumber: 1,
                status: 'DRAFT',
                title: 'Cierre de caja',
                description: null,
                createdById: OWNER_ID,
              },
            },
          },
        }),
      );
      expect(record).toEqual({
        id: PROCEDURE_ID,
        ownerId: OWNER_ID,
        createdAt: T0,
        updatedAt: T0,
        areaIds: [VENTAS],
        versions: [
          {
            id: VERSION_ID,
            procedureId: PROCEDURE_ID,
            versionNumber: 1,
            status: 'DRAFT',
            title: 'Cierre de caja',
            description: null,
            createdById: OWNER_ID,
            createdAt: T0,
            updatedAt: T0,
            stepCount: 0,
          },
        ],
      });
    });

    it('translates a database that is down', async () => {
      prisma.procedure.create.mockRejectedValue(knownError('P1001'));

      await expect(repository.create(newProcedure)).rejects.toBeInstanceOf(
        ProceduresRepositoryUnavailableError,
      );
    });

    it('lets any other error through unchanged', async () => {
      const boom = new Error('boom');
      prisma.procedure.create.mockRejectedValue(boom);

      await expect(repository.create(newProcedure)).rejects.toBe(boom);
    });
  });

  describe('findById', () => {
    it('is null when the procedure does not exist', async () => {
      prisma.procedure.findUnique.mockResolvedValue(null);

      await expect(repository.findById(PROCEDURE_ID)).resolves.toBeNull();
    });

    it('returns the areas and the number of steps of each version', async () => {
      prisma.procedure.findUnique.mockResolvedValue(
        procedureRow({
          versions: [
            versionRow({ status: 'PUBLISHED', _count: { steps: 3 } }),
          ],
        }),
      );

      const record = await repository.findById(PROCEDURE_ID);

      expect(record?.areaIds).toEqual([VENTAS]);
      expect(record?.versions.map((v) => [v.status, v.stepCount])).toEqual([
        ['PUBLISHED', 3],
      ]);
    });

    it('translates a database that is down', async () => {
      prisma.procedure.findUnique.mockRejectedValue(knownError('P1008'));

      await expect(repository.findById(PROCEDURE_ID)).rejects.toBeInstanceOf(
        ProceduresRepositoryUnavailableError,
      );
    });
  });

  describe('createDraft', () => {
    const published = {
      title: 'Cierre de caja',
      description: 'Al final del turno',
      steps: [
        { stepOrder: 1, title: 'Contar', description: '' },
        { stepOrder: 2, title: 'Comparar', description: 'Con el reporte' },
      ],
    };

    // The procedure is found (locked), it has no draft and one PUBLISHED version.
    const happyPath = () => {
      txClient.$queryRaw.mockResolvedValue([{ id: PROCEDURE_ID }]);
      txClient.procedureVersion.findFirst
        .mockResolvedValueOnce(null) // draft
        .mockResolvedValueOnce(published); // current PUBLISHED
      txClient.procedureVersion.aggregate.mockResolvedValue({
        _max: { versionNumber: 2 },
      });
      txClient.procedureVersion.create.mockResolvedValue(
        versionRow({
          id: NEW_VERSION_ID,
          versionNumber: 3,
          _count: { steps: 2 },
        }),
      );
    };

    it('R4: creates the next version as a DRAFT copying title, description and steps', async () => {
      happyPath();

      const version = await repository.createDraft(newDraft);

      expect(txClient.procedureVersion.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            id: NEW_VERSION_ID,
            procedureId: PROCEDURE_ID,
            versionNumber: 3,
            status: 'DRAFT',
            title: 'Cierre de caja',
            description: 'Al final del turno',
            createdById: OWNER_ID,
            steps: {
              create: [
                { stepOrder: 1, title: 'Contar', description: '' },
                {
                  stepOrder: 2,
                  title: 'Comparar',
                  description: 'Con el reporte',
                },
              ],
            },
          },
        }),
      );
      expect(version).toMatchObject({
        id: NEW_VERSION_ID,
        versionNumber: 3,
        status: 'DRAFT',
        stepCount: 2,
      });
    });

    it('runs in a transaction with a timeout', async () => {
      happyPath();

      await repository.createDraft(newDraft);

      expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
        timeout: 5000,
        maxWait: 2000,
      });
    });

    it('is null when the procedure does not exist', async () => {
      txClient.$queryRaw.mockResolvedValue([]);

      await expect(repository.createDraft(newDraft)).resolves.toBeNull();
      expect(txClient.procedureVersion.create).not.toHaveBeenCalled();
    });

    it('R3: throws DraftAlreadyExistsError when the procedure already has a draft', async () => {
      txClient.$queryRaw.mockResolvedValue([{ id: PROCEDURE_ID }]);
      txClient.procedureVersion.findFirst.mockResolvedValueOnce({
        id: VERSION_ID,
      });

      await expect(repository.createDraft(newDraft)).rejects.toBeInstanceOf(
        DraftAlreadyExistsError,
      );
      expect(txClient.procedureVersion.create).not.toHaveBeenCalled();
    });

    it('R4: throws NoPublishedVersionError when there is no PUBLISHED version to copy', async () => {
      txClient.$queryRaw.mockResolvedValue([{ id: PROCEDURE_ID }]);
      txClient.procedureVersion.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);

      await expect(repository.createDraft(newDraft)).rejects.toBeInstanceOf(
        NoPublishedVersionError,
      );
    });

    it('R3: turns the one-draft index violation into DraftAlreadyExistsError', async () => {
      prisma.$transaction.mockRejectedValue(
        uniqueViolation('procedure_versions_one_draft_idx'),
      );

      await expect(repository.createDraft(newDraft)).rejects.toBeInstanceOf(
        DraftAlreadyExistsError,
      );
    });

    it('does not mistake another unique violation for an existing draft', async () => {
      const other = uniqueViolation(
        'procedure_versions_procedure_id_version_number_key',
      );
      prisma.$transaction.mockRejectedValue(other);

      await expect(repository.createDraft(newDraft)).rejects.toBe(other);
    });

    it('translates a database that is down', async () => {
      prisma.$transaction.mockRejectedValue(knownError('P2028'));

      await expect(repository.createDraft(newDraft)).rejects.toBeInstanceOf(
        ProceduresRepositoryUnavailableError,
      );
    });
  });

  describe('updateDraft', () => {
    it('R9: is NOT_FOUND when the version is not in that procedure', async () => {
      txClient.$queryRaw.mockResolvedValue([]);

      await expect(
        repository.updateDraft(PROCEDURE_ID, VERSION_ID, { title: 'Nuevo' }),
      ).resolves.toEqual({ ok: false, reason: 'NOT_FOUND' });
      expect(txClient.procedureVersion.update).not.toHaveBeenCalled();
    });

    it.each(['PUBLISHED', 'SUPERSEDED'])(
      'R9: is NOT_A_DRAFT when the version is %s, and nothing is written',
      async (status) => {
        txClient.$queryRaw.mockResolvedValue([{ status }]);

        await expect(
          repository.updateDraft(PROCEDURE_ID, VERSION_ID, { title: 'Nuevo' }),
        ).resolves.toEqual({ ok: false, reason: 'NOT_A_DRAFT' });
        expect(txClient.procedureVersion.update).not.toHaveBeenCalled();
      },
    );

    it('R5: writes only the fields that were sent', async () => {
      txClient.$queryRaw.mockResolvedValue([{ status: 'DRAFT' }]);
      txClient.procedureVersion.update.mockResolvedValue(
        versionRow({ title: 'Nuevo' }),
      );

      const result = await repository.updateDraft(PROCEDURE_ID, VERSION_ID, {
        title: 'Nuevo',
      });

      expect(txClient.procedureVersion.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: VERSION_ID },
          data: { title: 'Nuevo' },
        }),
      );
      expect(result).toMatchObject({ ok: true, value: { title: 'Nuevo' } });
    });
  });

  describe('deleteDraft', () => {
    it('is NOT_FOUND when the procedure does not exist', async () => {
      txClient.$queryRaw.mockResolvedValueOnce([]);

      await expect(
        repository.deleteDraft(PROCEDURE_ID, VERSION_ID),
      ).resolves.toEqual({ ok: false, reason: 'NOT_FOUND' });
    });

    it('is NOT_FOUND when the version is not in that procedure', async () => {
      txClient.$queryRaw
        .mockResolvedValueOnce([{ id: PROCEDURE_ID }])
        .mockResolvedValueOnce([]);

      await expect(
        repository.deleteDraft(PROCEDURE_ID, VERSION_ID),
      ).resolves.toEqual({ ok: false, reason: 'NOT_FOUND' });
      expect(txClient.procedureVersion.delete).not.toHaveBeenCalled();
    });

    it.each(['PUBLISHED', 'SUPERSEDED'])(
      'R10: is NOT_A_DRAFT when the version is %s, and nothing is deleted',
      async (status) => {
        txClient.$queryRaw
          .mockResolvedValueOnce([{ id: PROCEDURE_ID }])
          .mockResolvedValueOnce([{ status }]);

        await expect(
          repository.deleteDraft(PROCEDURE_ID, VERSION_ID),
        ).resolves.toEqual({ ok: false, reason: 'NOT_A_DRAFT' });
        expect(txClient.procedureVersion.delete).not.toHaveBeenCalled();
        expect(txClient.procedure.delete).not.toHaveBeenCalled();
      },
    );

    it('R10: deletes only the draft when the procedure has other versions', async () => {
      txClient.$queryRaw
        .mockResolvedValueOnce([{ id: PROCEDURE_ID }])
        .mockResolvedValueOnce([{ status: 'DRAFT' }]);
      txClient.procedureVersion.count.mockResolvedValue(1);

      await expect(
        repository.deleteDraft(PROCEDURE_ID, VERSION_ID),
      ).resolves.toEqual({ ok: true, value: { procedureDeleted: false } });
      expect(txClient.procedureVersion.delete).toHaveBeenCalledWith({
        where: { id: VERSION_ID },
      });
      expect(txClient.procedure.delete).not.toHaveBeenCalled();
    });

    it('R10: also deletes the procedure when the draft was its only version', async () => {
      txClient.$queryRaw
        .mockResolvedValueOnce([{ id: PROCEDURE_ID }])
        .mockResolvedValueOnce([{ status: 'DRAFT' }]);
      txClient.procedureVersion.count.mockResolvedValue(0);

      await expect(
        repository.deleteDraft(PROCEDURE_ID, VERSION_ID),
      ).resolves.toEqual({ ok: true, value: { procedureDeleted: true } });
      expect(txClient.procedure.delete).toHaveBeenCalledWith({
        where: { id: PROCEDURE_ID },
      });
    });

    it('translates a database that is down', async () => {
      prisma.$transaction.mockRejectedValue(knownError('P1017'));

      await expect(
        repository.deleteDraft(PROCEDURE_ID, VERSION_ID),
      ).rejects.toBeInstanceOf(ProceduresRepositoryUnavailableError);
    });
  });
});
