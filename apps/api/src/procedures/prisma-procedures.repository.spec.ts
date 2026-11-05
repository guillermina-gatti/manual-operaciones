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

const [STEP_A, STEP_B, STEP_C] = [
  '1c000000-0000-4000-8000-000000000001',
  '1c000000-0000-4000-8000-000000000002',
  '1c000000-0000-4000-8000-000000000003',
];
const NEW_STEP = '1c000000-0000-4000-8000-000000000009';

const stepRow = (
  id: string,
  stepOrder: number,
  overrides: Record<string, unknown> = {},
) => ({
  id,
  procedureVersionId: VERSION_ID,
  stepOrder,
  title: `Paso ${stepOrder}`,
  description: '',
  ...overrides,
});
const ids = (...list: string[]) => list.map((id) => ({ id }));

const clientMock = () => ({
  $queryRaw: jest.fn(),
  $executeRaw: jest.fn(),
  procedure: { create: jest.fn(), findUnique: jest.fn(), delete: jest.fn() },
  procedureVersion: {
    findFirst: jest.fn(),
    aggregate: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  },
  step: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
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

  // The version is locked and is a DRAFT, with the steps it already has.
  const draftWith = (...existing: string[]) => {
    txClient.$queryRaw.mockResolvedValue([{ status: 'DRAFT' }]);
    txClient.step.findMany.mockResolvedValue(ids(...existing));
  };

  const expectNothingWritten = () => {
    expect(txClient.step.create).not.toHaveBeenCalled();
    expect(txClient.step.update).not.toHaveBeenCalled();
    expect(txClient.step.delete).not.toHaveBeenCalled();
    expect(txClient.$executeRaw).not.toHaveBeenCalled();
  };

  // Every step operation shares the lock, the draft check and the transaction (R9).
  describe.each([
    [
      'addStep',
      () =>
        repository.addStep(
          PROCEDURE_ID,
          VERSION_ID,
          { id: NEW_STEP, title: 'X', description: '' },
          50,
        ),
    ],
    [
      'updateStep',
      () =>
        repository.updateStep(PROCEDURE_ID, VERSION_ID, STEP_A, { title: 'X' }),
    ],
    [
      'deleteStep',
      () => repository.deleteStep(PROCEDURE_ID, VERSION_ID, STEP_A),
    ],
    [
      'reorderSteps',
      () => repository.reorderSteps(PROCEDURE_ID, VERSION_ID, [STEP_A]),
    ],
  ])('%s', (_name, run) => {
    it('is NOT_FOUND when the version is not in that procedure, and writes nothing', async () => {
      txClient.$queryRaw.mockResolvedValue([]);

      await expect(run()).resolves.toEqual({ ok: false, reason: 'NOT_FOUND' });
      expectNothingWritten();
    });

    it.each(['PUBLISHED', 'SUPERSEDED'])(
      'R9: is NOT_A_DRAFT when the version is %s, and writes nothing',
      async (status) => {
        txClient.$queryRaw.mockResolvedValue([{ status }]);

        await expect(run()).resolves.toEqual({
          ok: false,
          reason: 'NOT_A_DRAFT',
        });
        expectNothingWritten();
      },
    );

    it('runs in a transaction with a timeout and translates a database that is down', async () => {
      txClient.$queryRaw.mockResolvedValue([]);
      await run();
      expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
        timeout: 5000,
        maxWait: 2000,
      });

      prisma.$transaction.mockRejectedValue(knownError('P2028'));
      await expect(run()).rejects.toBeInstanceOf(
        ProceduresRepositoryUnavailableError,
      );
    });
  });

  describe('addStep', () => {
    const add = (position?: number, maxSteps = 50) =>
      repository.addStep(
        PROCEDURE_ID,
        VERSION_ID,
        { id: NEW_STEP, title: 'Nuevo', description: 'Desc', position },
        maxSteps,
      );

    it('R7: adds at the end with the next order and does not renumber', async () => {
      draftWith(STEP_A, STEP_B);
      txClient.step.create.mockResolvedValue(
        stepRow(NEW_STEP, 3, { title: 'Nuevo', description: 'Desc' }),
      );

      const result = await add();

      expect(txClient.step.create).toHaveBeenCalledWith({
        data: {
          id: NEW_STEP,
          procedureVersionId: VERSION_ID,
          stepOrder: 3,
          title: 'Nuevo',
          description: 'Desc',
        },
      });
      expect(txClient.$executeRaw).not.toHaveBeenCalled();
      expect(result).toEqual({
        ok: true,
        value: {
          id: NEW_STEP,
          procedureVersionId: VERSION_ID,
          order: 3,
          title: 'Nuevo',
          description: 'Desc',
        },
      });
    });

    it('E5: adds in the middle with that order and renumbers the others in two passes', async () => {
      draftWith(STEP_A, STEP_B);
      txClient.step.create.mockResolvedValue(stepRow(NEW_STEP, 2));

      await add(2);

      expect(txClient.step.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ id: NEW_STEP, stepOrder: 2 }),
      });
      expect(txClient.$executeRaw).toHaveBeenCalledTimes(2); // negate, then the final orders
    });

    it('R6: is STEP_LIMIT_REACHED when the draft already has the maximum', async () => {
      draftWith(STEP_A, STEP_B);

      await expect(add(undefined, 2)).resolves.toEqual({
        ok: false,
        reason: 'STEP_LIMIT_REACHED',
      });
      expectNothingWritten();
    });

    it.each([0, 4, 1.5])(
      'R7: is INVALID_POSITION for position %p with two steps, and writes nothing',
      async (position) => {
        draftWith(STEP_A, STEP_B);

        await expect(add(position)).resolves.toEqual({
          ok: false,
          reason: 'INVALID_POSITION',
        });
        expectNothingWritten();
      },
    );
  });

  describe('updateStep', () => {
    it('is STEP_NOT_FOUND when the step is not in that version', async () => {
      txClient.$queryRaw.mockResolvedValue([{ status: 'DRAFT' }]);
      txClient.step.findFirst.mockResolvedValue(null);

      await expect(
        repository.updateStep(PROCEDURE_ID, VERSION_ID, STEP_A, { title: 'X' }),
      ).resolves.toEqual({ ok: false, reason: 'STEP_NOT_FOUND' });
      expect(txClient.step.update).not.toHaveBeenCalled();
    });

    it('R6: writes only the fields that were sent', async () => {
      txClient.$queryRaw.mockResolvedValue([{ status: 'DRAFT' }]);
      txClient.step.findFirst.mockResolvedValue({ id: STEP_A });
      txClient.step.update.mockResolvedValue(
        stepRow(STEP_A, 1, { title: 'Nuevo' }),
      );

      const result = await repository.updateStep(
        PROCEDURE_ID,
        VERSION_ID,
        STEP_A,
        { title: 'Nuevo' },
      );

      expect(txClient.step.update).toHaveBeenCalledWith({
        where: { id: STEP_A },
        data: { title: 'Nuevo' },
      });
      expect(result).toMatchObject({
        ok: true,
        value: { id: STEP_A, title: 'Nuevo' },
      });
    });
  });

  describe('deleteStep', () => {
    it('is STEP_NOT_FOUND when the step is not in that version', async () => {
      draftWith(STEP_A, STEP_B);

      await expect(
        repository.deleteStep(PROCEDURE_ID, VERSION_ID, STEP_C),
      ).resolves.toEqual({ ok: false, reason: 'STEP_NOT_FOUND' });
      expect(txClient.step.delete).not.toHaveBeenCalled();
    });

    it('E6: deletes the step and renumbers the remaining ones in two passes', async () => {
      draftWith(STEP_A, STEP_B, STEP_C);

      await expect(
        repository.deleteStep(PROCEDURE_ID, VERSION_ID, STEP_B),
      ).resolves.toEqual({ ok: true, value: undefined });

      expect(txClient.step.delete).toHaveBeenCalledWith({
        where: { id: STEP_B },
      });
      expect(txClient.$executeRaw).toHaveBeenCalledTimes(2);
    });

    it('does not renumber when the version is left without steps', async () => {
      draftWith(STEP_A);

      await repository.deleteStep(PROCEDURE_ID, VERSION_ID, STEP_A);

      expect(txClient.step.delete).toHaveBeenCalled();
      expect(txClient.$executeRaw).not.toHaveBeenCalled();
    });
  });

  describe('reorderSteps', () => {
    it.each([
      ['a step is missing', [STEP_A, STEP_B]],
      ['a step is repeated', [STEP_A, STEP_A, STEP_C]],
      ['a step is not from the version', [STEP_A, STEP_B, NEW_STEP]],
    ])(
      'R8: is INVALID_ORDER when %s, and writes nothing',
      async (_case, requested) => {
        draftWith(STEP_A, STEP_B, STEP_C);

        await expect(
          repository.reorderSteps(PROCEDURE_ID, VERSION_ID, requested),
        ).resolves.toEqual({ ok: false, reason: 'INVALID_ORDER' });
        expectNothingWritten();
      },
    );

    it('E7: renumbers in two passes and returns the steps in the new order', async () => {
      txClient.$queryRaw.mockResolvedValue([{ status: 'DRAFT' }]);
      txClient.step.findMany
        .mockResolvedValueOnce(ids(STEP_A, STEP_B, STEP_C)) // before
        .mockResolvedValueOnce([
          stepRow(STEP_C, 1),
          stepRow(STEP_A, 2),
          stepRow(STEP_B, 3),
        ]); // after

      const result = await repository.reorderSteps(PROCEDURE_ID, VERSION_ID, [
        STEP_C,
        STEP_A,
        STEP_B,
      ]);

      expect(txClient.$executeRaw).toHaveBeenCalledTimes(2);
      expect(result.ok && result.value.map((s) => [s.id, s.order])).toEqual([
        [STEP_C, 1],
        [STEP_A, 2],
        [STEP_B, 3],
      ]);
    });
  });
});
