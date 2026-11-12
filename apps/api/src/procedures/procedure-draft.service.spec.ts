import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { SPEC_USERS } from '../../test/executions/real-auth';
import type { AuthUser } from '../common/auth';
import { ProcedureDraftService } from './procedure-draft.service';
import {
  DraftAlreadyExistsError,
  NoPublishedVersionError,
  ProceduresRepositoryUnavailableError,
} from './procedures.repository';
import type {
  ProcedureRecord,
  ProceduresRepository,
  VersionRecord,
} from './procedures.repository';

// As the real guard leaves them in request.user (id, email, name, role and areas).
const ADMIN: AuthUser = SPEC_USERS.admin;
const SUPERVISOR: AuthUser = SPEC_USERS.supervisorVentas;
const EMPLOYEE: AuthUser = SPEC_USERS.empleadoVentas;

const PROCEDURE_ID = '1a000000-0000-4000-8000-000000000001';
const VERSION_ID = '1b000000-0000-4000-8000-000000000001';
const T0 = new Date('2026-10-27T10:00:00.000Z');

const version = (overrides: Partial<VersionRecord> = {}): VersionRecord => ({
  id: VERSION_ID,
  procedureId: PROCEDURE_ID,
  versionNumber: 1,
  status: 'DRAFT',
  title: 'Cierre de caja',
  description: null,
  createdById: ADMIN.id,
  createdAt: T0,
  updatedAt: T0,
  stepCount: 0,
  ...overrides,
});

const procedure = (): ProcedureRecord => ({
  id: PROCEDURE_ID,
  ownerId: ADMIN.id,
  createdAt: T0,
  updatedAt: T0,
  areaIds: [],
  versions: [version()],
});

// The reason of a 409, to check it next to the status.
const conflictReason = async (promise: Promise<unknown>) => {
  const error = await promise.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(ConflictException);
  return (error as ConflictException).getResponse();
};

describe('ProcedureDraftService', () => {
  let repository: Record<
    | 'create'
    | 'createDraft'
    | 'updateDraft'
    | 'deleteDraft'
    | 'addStep'
    | 'updateStep'
    | 'deleteStep'
    | 'reorderSteps',
    jest.Mock
  >;
  let service: ProcedureDraftService;
  let loggerError: jest.SpyInstance;

  beforeEach(() => {
    repository = {
      create: jest.fn(),
      createDraft: jest.fn(),
      updateDraft: jest.fn(),
      deleteDraft: jest.fn(),
      addStep: jest.fn(),
      updateStep: jest.fn(),
      deleteStep: jest.fn(),
      reorderSteps: jest.fn(),
    };
    loggerError = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => {});
    service = new ProcedureDraftService(
      repository as unknown as ProceduresRepository,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('create', () => {
    it('R2: creates the procedure with a generated id, the caller as owner and the data received', async () => {
      repository.create.mockResolvedValue(procedure());

      const result = await service.create(ADMIN, {
        title: 'Cierre de caja',
        description: 'Al final del turno',
      });

      expect(repository.create).toHaveBeenCalledWith({
        id: expect.stringMatching(/^[0-9a-f-]{36}$/),
        versionId: expect.stringMatching(/^[0-9a-f-]{36}$/),
        ownerId: ADMIN.id,
        title: 'Cierre de caja',
        description: 'Al final del turno',
      });
      expect(result).toEqual(procedure());
    });

    it('R2: stores a missing description as null', async () => {
      repository.create.mockResolvedValue(procedure());

      await service.create(ADMIN, { title: 'Cierre de caja' });

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({ description: null }),
      );
    });
  });

  describe('createDraft', () => {
    it('R4: asks for the next draft with the caller as author and returns it', async () => {
      const draft = version({ id: 'draft-id', versionNumber: 2 });
      repository.createDraft.mockResolvedValue(draft);

      const result = await service.createDraft(ADMIN, PROCEDURE_ID);

      expect(repository.createDraft).toHaveBeenCalledWith({
        procedureId: PROCEDURE_ID,
        versionId: expect.stringMatching(/^[0-9a-f-]{36}$/),
        createdById: ADMIN.id,
      });
      expect(result).toBe(draft);
    });

    it('is a 404 when the procedure does not exist', async () => {
      repository.createDraft.mockResolvedValue(null);

      await expect(service.createDraft(ADMIN, PROCEDURE_ID)).rejects.toEqual(
        new NotFoundException('No se encontró el procedimiento'),
      );
    });

    it('R3: a second draft is a 409 with reason DRAFT_ALREADY_EXISTS', async () => {
      repository.createDraft.mockRejectedValue(
        new DraftAlreadyExistsError('already'),
      );

      await expect(
        conflictReason(service.createDraft(ADMIN, PROCEDURE_ID)),
      ).resolves.toMatchObject({
        statusCode: 409,
        error: 'Conflict',
        reason: 'DRAFT_ALREADY_EXISTS',
      });
    });

    it('R4: a procedure without a published version is a 409 with reason NO_PUBLISHED_VERSION', async () => {
      repository.createDraft.mockRejectedValue(
        new NoPublishedVersionError('none'),
      );

      await expect(
        conflictReason(service.createDraft(ADMIN, PROCEDURE_ID)),
      ).resolves.toMatchObject({ reason: 'NO_PUBLISHED_VERSION' });
    });
  });

  describe('update', () => {
    it('R5: sends only the field that came', async () => {
      const updated = version({ title: 'Nuevo' });
      repository.updateDraft.mockResolvedValue({ ok: true, value: updated });

      const result = await service.update(ADMIN, PROCEDURE_ID, VERSION_ID, {
        title: 'Nuevo',
      });

      expect(repository.updateDraft).toHaveBeenCalledWith(
        PROCEDURE_ID,
        VERSION_ID,
        { title: 'Nuevo' },
      );
      expect(result).toBe(updated);
    });

    it('R5: an empty change is a 400 and the repository is not called', async () => {
      await expect(
        service.update(ADMIN, PROCEDURE_ID, VERSION_ID, {}),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(repository.updateDraft).not.toHaveBeenCalled();
    });

    it('is a 404 when the version is not in that procedure', async () => {
      repository.updateDraft.mockResolvedValue({
        ok: false,
        reason: 'NOT_FOUND',
      });

      await expect(
        service.update(ADMIN, PROCEDURE_ID, VERSION_ID, { title: 'X' }),
      ).rejects.toEqual(
        new NotFoundException('No se encontró el procedimiento'),
      );
    });

    it('R9: a version that is not a draft is a 409 with reason VERSION_NOT_EDITABLE', async () => {
      repository.updateDraft.mockResolvedValue({
        ok: false,
        reason: 'NOT_A_DRAFT',
      });

      await expect(
        conflictReason(
          service.update(ADMIN, PROCEDURE_ID, VERSION_ID, { title: 'X' }),
        ),
      ).resolves.toMatchObject({ reason: 'VERSION_NOT_EDITABLE' });
    });
  });

  describe('remove', () => {
    it.each([true, false])(
      'R10: deletes the draft (procedureDeleted: %s) and returns nothing',
      async (procedureDeleted) => {
        repository.deleteDraft.mockResolvedValue({
          ok: true,
          value: { procedureDeleted },
        });

        await expect(
          service.remove(ADMIN, PROCEDURE_ID, VERSION_ID),
        ).resolves.toBeUndefined();
        expect(repository.deleteDraft).toHaveBeenCalledWith(
          PROCEDURE_ID,
          VERSION_ID,
        );
      },
    );

    it('is a 404 when the version is not in that procedure', async () => {
      repository.deleteDraft.mockResolvedValue({
        ok: false,
        reason: 'NOT_FOUND',
      });

      await expect(
        service.remove(ADMIN, PROCEDURE_ID, VERSION_ID),
      ).rejects.toEqual(
        new NotFoundException('No se encontró el procedimiento'),
      );
    });

    it('R10: a version that is not a draft is a 409 with reason VERSION_NOT_EDITABLE', async () => {
      repository.deleteDraft.mockResolvedValue({
        ok: false,
        reason: 'NOT_A_DRAFT',
      });

      await expect(
        conflictReason(service.remove(ADMIN, PROCEDURE_ID, VERSION_ID)),
      ).resolves.toMatchObject({ reason: 'VERSION_NOT_EDITABLE' });
    });
  });

  describe('addStep', () => {
    const step = {
      id: 'step-id',
      procedureVersionId: VERSION_ID,
      order: 1,
      title: 'Contar',
      description: '',
    };

    it('R6: adds the step with a generated id and the limit of 50', async () => {
      repository.addStep.mockResolvedValue({ ok: true, value: step });

      const result = await service.addStep(ADMIN, PROCEDURE_ID, VERSION_ID, {
        title: 'Contar',
        description: 'Billetes y monedas',
      });

      expect(repository.addStep).toHaveBeenCalledWith(
        PROCEDURE_ID,
        VERSION_ID,
        {
          id: expect.stringMatching(/^[0-9a-f-]{36}$/),
          title: 'Contar',
          description: 'Billetes y monedas',
          position: undefined,
        },
        50,
      );
      expect(result).toBe(step);
    });

    it('R6: a missing description is stored as an empty text', async () => {
      repository.addStep.mockResolvedValue({ ok: true, value: step });

      await service.addStep(ADMIN, PROCEDURE_ID, VERSION_ID, {
        title: 'Contar',
      });

      expect(repository.addStep).toHaveBeenCalledWith(
        PROCEDURE_ID,
        VERSION_ID,
        expect.objectContaining({ description: '' }),
        50,
      );
    });

    it('R7: passes the position', async () => {
      repository.addStep.mockResolvedValue({ ok: true, value: step });

      await service.addStep(ADMIN, PROCEDURE_ID, VERSION_ID, {
        title: 'Contar',
        position: 2,
      });

      expect(repository.addStep).toHaveBeenCalledWith(
        PROCEDURE_ID,
        VERSION_ID,
        expect.objectContaining({ position: 2 }),
        50,
      );
    });

    it('R6: the 51st step is a 409 with reason STEP_LIMIT_REACHED', async () => {
      repository.addStep.mockResolvedValue({
        ok: false,
        reason: 'STEP_LIMIT_REACHED',
      });

      await expect(
        conflictReason(
          service.addStep(ADMIN, PROCEDURE_ID, VERSION_ID, { title: 'X' }),
        ),
      ).resolves.toMatchObject({ reason: 'STEP_LIMIT_REACHED' });
    });

    it('R7: a position out of range is a 400', async () => {
      repository.addStep.mockResolvedValue({
        ok: false,
        reason: 'INVALID_POSITION',
      });

      await expect(
        service.addStep(ADMIN, PROCEDURE_ID, VERSION_ID, {
          title: 'X',
          position: 9,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('updateStep', () => {
    it('R6: sends only the field that came', async () => {
      const updated = {
        id: 'step-id',
        procedureVersionId: VERSION_ID,
        order: 1,
        title: 'Nuevo',
        description: '',
      };
      repository.updateStep.mockResolvedValue({ ok: true, value: updated });

      const result = await service.updateStep(
        ADMIN,
        PROCEDURE_ID,
        VERSION_ID,
        'step-id',
        { title: 'Nuevo' },
      );

      expect(repository.updateStep).toHaveBeenCalledWith(
        PROCEDURE_ID,
        VERSION_ID,
        'step-id',
        { title: 'Nuevo', description: undefined },
      );
      expect(result).toBe(updated);
    });

    it('R6: an empty change is a 400 and the repository is not called', async () => {
      await expect(
        service.updateStep(ADMIN, PROCEDURE_ID, VERSION_ID, 'step-id', {}),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(repository.updateStep).not.toHaveBeenCalled();
    });
  });

  describe('removeStep', () => {
    it('R7: deletes the step and returns nothing', async () => {
      repository.deleteStep.mockResolvedValue({ ok: true, value: undefined });

      await expect(
        service.removeStep(ADMIN, PROCEDURE_ID, VERSION_ID, 'step-id'),
      ).resolves.toBeUndefined();
      expect(repository.deleteStep).toHaveBeenCalledWith(
        PROCEDURE_ID,
        VERSION_ID,
        'step-id',
      );
    });
  });

  describe('reorderSteps', () => {
    it('R8: passes the new order and returns the steps in it', async () => {
      const steps = [
        {
          id: 'b',
          procedureVersionId: VERSION_ID,
          order: 1,
          title: 'B',
          description: '',
        },
      ];
      repository.reorderSteps.mockResolvedValue({ ok: true, value: steps });

      const result = await service.reorderSteps(
        ADMIN,
        PROCEDURE_ID,
        VERSION_ID,
        { stepIds: ['b', 'a'] },
      );

      expect(repository.reorderSteps).toHaveBeenCalledWith(
        PROCEDURE_ID,
        VERSION_ID,
        ['b', 'a'],
      );
      expect(result).toBe(steps);
    });

    it('R8: a list that is not the steps of the draft is a 400', async () => {
      repository.reorderSteps.mockResolvedValue({
        ok: false,
        reason: 'INVALID_ORDER',
      });

      await expect(
        service.reorderSteps(ADMIN, PROCEDURE_ID, VERSION_ID, {
          stepIds: ['a'],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  // The four operations on a step answer the same to the same rejections.
  describe.each([
    [
      'addStep',
      'addStep',
      () => service.addStep(ADMIN, PROCEDURE_ID, VERSION_ID, { title: 'X' }),
    ],
    [
      'updateStep',
      'updateStep',
      () =>
        service.updateStep(ADMIN, PROCEDURE_ID, VERSION_ID, 'step-id', {
          title: 'X',
        }),
    ],
    [
      'removeStep',
      'deleteStep',
      () => service.removeStep(ADMIN, PROCEDURE_ID, VERSION_ID, 'step-id'),
    ],
    [
      'reorderSteps',
      'reorderSteps',
      () =>
        service.reorderSteps(ADMIN, PROCEDURE_ID, VERSION_ID, {
          stepIds: ['a'],
        }),
    ],
  ] as const)('%s rejections', (_name, repositoryMethod, run) => {
    it('R9: a version that is not a draft is a 409 with reason VERSION_NOT_EDITABLE', async () => {
      repository[repositoryMethod].mockResolvedValue({
        ok: false,
        reason: 'NOT_A_DRAFT',
      });

      await expect(conflictReason(run())).resolves.toMatchObject({
        statusCode: 409,
        reason: 'VERSION_NOT_EDITABLE',
      });
    });

    it('is a 404 when the version is not in that procedure', async () => {
      repository[repositoryMethod].mockResolvedValue({
        ok: false,
        reason: 'NOT_FOUND',
      });

      await expect(run()).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  it.each([
    [
      'updateStep',
      () =>
        service.updateStep(ADMIN, PROCEDURE_ID, VERSION_ID, 'step-id', {
          title: 'X',
        }),
    ],
    [
      'deleteStep',
      () => service.removeStep(ADMIN, PROCEDURE_ID, VERSION_ID, 'step-id'),
    ],
  ] as const)(
    'a step that is not in the version is a 404 (%s)',
    async (method, run) => {
      repository[method].mockResolvedValue({
        ok: false,
        reason: 'STEP_NOT_FOUND',
      });

      await expect(run()).rejects.toEqual(
        new NotFoundException('No se encontró el paso'),
      );
    },
  );

  // Every operation shares the role check and the error mapping.
  describe.each([
    ['create', (user: AuthUser) => service.create(user, { title: 'X' })],
    [
      'createDraft',
      (user: AuthUser) => service.createDraft(user, PROCEDURE_ID),
    ],
    [
      'update',
      (user: AuthUser) =>
        service.update(user, PROCEDURE_ID, VERSION_ID, { title: 'X' }),
    ],
    [
      'remove',
      (user: AuthUser) => service.remove(user, PROCEDURE_ID, VERSION_ID),
    ],
    [
      'addStep',
      (user: AuthUser) =>
        service.addStep(user, PROCEDURE_ID, VERSION_ID, { title: 'X' }),
    ],
    [
      'updateStep',
      (user: AuthUser) =>
        service.updateStep(user, PROCEDURE_ID, VERSION_ID, 'step-id', {
          title: 'X',
        }),
    ],
    [
      'removeStep',
      (user: AuthUser) =>
        service.removeStep(user, PROCEDURE_ID, VERSION_ID, 'step-id'),
    ],
    [
      'reorderSteps',
      (user: AuthUser) =>
        service.reorderSteps(user, PROCEDURE_ID, VERSION_ID, {
          stepIds: ['a'],
        }),
    ],
  ])('%s', (_name, run) => {
    // Whatever repository method this operation reaches rejects with the given error.
    const failWith = (error: unknown) => {
      for (const method of Object.values(repository))
        method.mockRejectedValue(error);
    };

    it.each([SUPERVISOR, EMPLOYEE])(
      'R1: a $role gets a 403 and the repository is not called',
      async (user) => {
        await expect(run(user)).rejects.toBeInstanceOf(ForbiddenException);
        for (const method of Object.values(repository)) {
          expect(method).not.toHaveBeenCalled();
        }
      },
    );

    it('a database that is down is a 503 without the cause', async () => {
      failWith(new ProceduresRepositoryUnavailableError('connection refused'));

      const error = await run(ADMIN).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ServiceUnavailableException);
      expect(
        JSON.stringify((error as ServiceUnavailableException).getResponse()),
      ).not.toContain('connection refused');
      expect(loggerError).toHaveBeenCalledWith(
        expect.objectContaining({ cause: 'connection refused' }),
      );
    });

    it('an unexpected error is a 500 without the cause, and the cause is logged', async () => {
      failWith(new Error('relation "steps" is broken'));

      const error = await run(ADMIN).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(InternalServerErrorException);
      expect(
        JSON.stringify((error as InternalServerErrorException).getResponse()),
      ).not.toContain('steps');
      expect(loggerError).toHaveBeenCalledWith(
        expect.objectContaining({ cause: 'relation "steps" is broken' }),
      );
    });
  });
});
