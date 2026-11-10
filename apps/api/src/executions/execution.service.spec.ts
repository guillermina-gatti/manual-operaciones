import {
  ConflictException,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { AuthUser } from '../common/auth';
import { AREA_IDS, FIXTURE_USERS } from '../documents/adapters/fixtures';
import { InMemoryAreasDirectory } from '../documents/adapters/in-memory-areas-directory';
import { InMemoryUsersDirectory } from '../documents/adapters/in-memory-users-directory';
import { RepositoryUnavailableError } from '../documents/documents.repository';
import type { AreasDirectory } from '../documents/ports/areas-directory';
import type {
  DirectoryUser,
  UsersDirectory,
} from '../documents/ports/users-directory';
import { InMemoryProceduresCatalog } from './adapters/in-memory-procedures-catalog';
import {
  FIXTURE_PROCEDURE_VERSIONS,
  FixtureProcedureVersion,
  PROCEDURE_IDS,
  PROCEDURE_VERSION_IDS,
} from './adapters/procedure-fixtures';
import { ExecutionService } from './execution.service';
import {
  ExecutionRestart,
  ExecutionInProgressError,
  ExecutionsRepositoryUnavailableError,
  ExecutionRecord,
  ExecutionsRepository,
  NewExecution,
  RepositoryTransaction,
  StepCompletion,
} from './executions.repository';
import { Clock } from './ports/clock';
import { CatalogUnavailableError } from './ports/procedures-catalog';

// ── Test doubles ────────────────────────────────────────────────────────────

class FakeClock extends Clock {
  constructor(private current: Date) {
    super();
  }
  now(): Date {
    return new Date(this.current);
  }
  set(iso: string): void {
    this.current = new Date(iso);
  }
}

// Keeps executions in memory and enforces the one-in-progress rule like the
// partial unique index does.
class FakeExecutionsRepository extends ExecutionsRepository {
  readonly records = new Map<string, ExecutionRecord>();
  readonly transactions: RepositoryTransaction[] = [];
  readonly completions: { tx: RepositoryTransaction; data: StepCompletion }[] =
    [];
  readonly restarts: { tx: RepositoryTransaction; data: ExecutionRestart }[] =
    [];
  inTransaction = false;
  // One transaction at a time, like the row lock (SELECT … FOR UPDATE) of the real one.
  private queue: Promise<unknown> = Promise.resolve();

  runInTransaction<T>(
    fn: (tx: RepositoryTransaction) => Promise<T>,
  ): Promise<T> {
    const run = async () => {
      const tx = {
        id: this.transactions.length,
      } as unknown as RepositoryTransaction;
      this.transactions.push(tx);
      this.inTransaction = true;
      try {
        return await fn(tx);
      } finally {
        this.inTransaction = false;
      }
    };
    const result = this.queue.then(run, run);
    this.queue = result.catch(() => undefined);
    return result;
  }

  create(data: NewExecution): Promise<ExecutionRecord> {
    const clash = [...this.records.values()].some(
      (r) =>
        r.userId === data.userId &&
        r.procedureId === data.procedureId &&
        r.status === 'IN_PROGRESS',
    );
    if (clash) {
      return Promise.reject(new ExecutionInProgressError('already running'));
    }
    const record: ExecutionRecord = {
      id: data.id,
      userId: data.userId,
      procedureId: data.procedureId,
      procedureVersionId: data.procedureVersionId,
      status: 'IN_PROGRESS',
      startedAt: data.startedAt,
      finishedAt: null,
      steps: [
        {
          stepId: data.firstStep.stepId,
          stepOrder: data.firstStep.stepOrder,
          startedAt: data.startedAt,
          finishedAt: null,
        },
      ],
    };
    this.records.set(record.id, record);
    return Promise.resolve(copy(record));
  }

  findById(id: string): Promise<ExecutionRecord | null> {
    const record = this.records.get(id);
    return Promise.resolve(record ? copy(record) : null);
  }

  findInProgress(
    userId: string,
    procedureId: string,
  ): Promise<ExecutionRecord | null> {
    const record = [...this.records.values()].find(
      (r) =>
        r.userId === userId &&
        r.procedureId === procedureId &&
        r.status === 'IN_PROGRESS',
    );
    return Promise.resolve(record ? copy(record) : null);
  }

  completeStep(
    tx: RepositoryTransaction,
    data: StepCompletion,
  ): Promise<ExecutionRecord> {
    this.completions.push({ tx, data });
    const record = this.records.get(data.executionId)!;
    const step = record.steps.find((s) => s.stepId === data.stepId)!;
    step.finishedAt = data.finishedAt;
    if (data.next) {
      record.steps.push({
        stepId: data.next.stepId,
        stepOrder: data.next.stepOrder,
        startedAt: data.finishedAt,
        finishedAt: null,
      });
    } else {
      record.status = 'COMPLETED';
      record.finishedAt = data.finishedAt;
    }
    return Promise.resolve(copy(record));
  }

  restart(
    tx: RepositoryTransaction,
    data: ExecutionRestart,
  ): Promise<ExecutionRecord> {
    this.restarts.push({ tx, data });
    const old = this.records.get(data.executionId)!;
    old.status = 'RESTARTED';
    old.finishedAt = data.closedAt;
    const { next } = data;
    const record: ExecutionRecord = {
      id: next.id,
      userId: next.userId,
      procedureId: next.procedureId,
      procedureVersionId: next.procedureVersionId,
      status: 'IN_PROGRESS',
      startedAt: next.startedAt,
      finishedAt: null,
      steps: [
        {
          stepId: next.firstStep.stepId,
          stepOrder: next.firstStep.stepOrder,
          startedAt: next.startedAt,
          finishedAt: null,
        },
      ],
    };
    this.records.set(record.id, record);
    return Promise.resolve(copy(record));
  }
}

const copy = (record: ExecutionRecord): ExecutionRecord => ({
  ...record,
  steps: record.steps.map((s) => ({ ...s })),
});

// ── Fixtures ────────────────────────────────────────────────────────────────

// As the real guard leaves it in request.user. The service still asks the directory
// for the areas, so the ones here only complete the shape.
const asAuthUser = (user: DirectoryUser): AuthUser => ({
  id: user.id,
  email: `${user.id}@fixtures.test`,
  name: `Usuario ${user.role}`,
  role: user.role,
  areaIds: [...user.areaIds],
});

const empleadoVentas = asAuthUser(FIXTURE_USERS.empleadoVentas);
// A second Ventas employee, so CA4 fails on ownership and not on areas.
const otroEmpleadoVentas: DirectoryUser = {
  id: '0b000000-0000-4000-8000-000000000099',
  name: 'Otra Empleada de Ventas',
  role: 'EMPLOYEE',
  areaIds: [AREA_IDS.ventas],
  isActive: true,
};
const otroVentas = asAuthUser(otroEmpleadoVentas);
const empleadoOperaciones = asAuthUser(FIXTURE_USERS.empleadoOperaciones);

const UNKNOWN_ID = '1f000000-0000-4000-8000-000000000099';
const CIERRE = PROCEDURE_IDS.cierreDeCaja;

const versionOf = (versionId: string) =>
  FIXTURE_PROCEDURE_VERSIONS.find((v) => v.versionId === versionId)!;
const V1 = versionOf(PROCEDURE_VERSION_IDS.cierreDeCajaV1);
const V2 = versionOf(PROCEDURE_VERSION_IDS.cierreDeCajaV2);

// Ventas published on v1 (v2 not yet), plus Operaciones as in the fixtures.
const catalogOnV1 = (): FixtureProcedureVersion[] => [
  { ...V1, published: true },
  { ...V2, published: false },
  ...FIXTURE_PROCEDURE_VERSIONS.filter((v) => v.procedureId !== CIERRE),
];

const expectNotFound = async (promise: Promise<unknown>) => {
  const error = await promise.then(
    () => {
      throw new Error('expected a NotFoundException');
    },
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(NotFoundException);
  return (error as NotFoundException).message;
};

const expectConflict = async (promise: Promise<unknown>, reason: string) => {
  await expect(promise).rejects.toBeInstanceOf(ConflictException);
  await expect(promise).rejects.toMatchObject({
    response: expect.objectContaining({ reason }) as unknown,
  });
};

describe('ExecutionService', () => {
  let catalog: InMemoryProceduresCatalog;
  let users: UsersDirectory;
  let areas: AreasDirectory;
  let repository: FakeExecutionsRepository;
  let clock: FakeClock;
  let service: ExecutionService;

  const build = () =>
    new ExecutionService(users, areas, catalog, repository, clock);

  beforeEach(() => {
    catalog = new InMemoryProceduresCatalog(catalogOnV1());
    users = new InMemoryUsersDirectory([
      ...Object.values(FIXTURE_USERS),
      otroEmpleadoVentas,
    ]);
    areas = new InMemoryAreasDirectory();
    repository = new FakeExecutionsRepository();
    clock = new FakeClock(new Date('2026-10-27T10:00:00.000Z'));
    service = build();
  });

  // ── Acceptance criteria ───────────────────────────────────────────────────

  describe('acceptance criteria', () => {
    it('CA1: the execution stays on the version it was started with', async () => {
      const { execution } = await service.start(empleadoVentas, CIERRE);

      catalog.publish(V2.versionId);
      const found = await service.findOne(empleadoVentas, execution.id);

      expect(found.procedureVersionId).toBe(V1.versionId);
      expect(found.steps.map((s) => s.stepId)).toEqual(
        V1.steps.map((s) => s.id),
      );
      // Completing still follows v1, not the newly published v2.
      const after = await service.completeStep(
        empleadoVentas,
        execution.id,
        V1.steps[0].id,
      );
      expect(after.currentStepId).toBe(V1.steps[1].id);
    });

    it('CA2: records start and end of each step, duration 180000 ms', async () => {
      const { execution } = await service.start(empleadoVentas, CIERRE);

      clock.set('2026-10-27T10:03:00.000Z');
      const after = await service.completeStep(
        empleadoVentas,
        execution.id,
        V1.steps[0].id,
      );

      expect(after.steps[0]).toMatchObject({
        stepId: V1.steps[0].id,
        startedAt: new Date('2026-10-27T10:00:00.000Z'),
        finishedAt: new Date('2026-10-27T10:03:00.000Z'),
        durationMs: 180000,
      });
      expect(after.steps[1]).toMatchObject({
        stepId: V1.steps[1].id,
        startedAt: new Date('2026-10-27T10:03:00.000Z'),
        finishedAt: null,
        durationMs: null,
      });
    });

    it('CA3: resumes from the last step and start returns the existing execution', async () => {
      const { execution } = await service.start(empleadoVentas, CIERRE);
      await service.completeStep(empleadoVentas, execution.id, V1.steps[0].id);
      await service.completeStep(empleadoVentas, execution.id, V1.steps[1].id);

      const found = await service.findOne(empleadoVentas, execution.id);
      const again = await service.start(empleadoVentas, CIERRE);

      expect(found.currentStepId).toBe(V1.steps[2].id);
      expect(again.created).toBe(false);
      expect(again.execution.id).toBe(execution.id);
      expect(again.execution.currentStepId).toBe(V1.steps[2].id);
    });

    it('CA4: another employee gets the same 404 as for a missing execution', async () => {
      const { execution } = await service.start(empleadoVentas, CIERRE);

      const foreign = await expectNotFound(
        service.findOne(otroVentas, execution.id),
      );
      const missing = await expectNotFound(
        service.findOne(empleadoVentas, UNKNOWN_ID),
      );
      const foreignComplete = await expectNotFound(
        service.completeStep(otroVentas, execution.id, V1.steps[0].id),
      );

      expect(foreign).toBe(missing);
      expect(foreignComplete).toBe(missing);
    });
  });

  // ── start ─────────────────────────────────────────────────────────────────

  describe('start', () => {
    it('creates an execution on the published version with step 1 started now', async () => {
      const { execution, created } = await service.start(
        empleadoVentas,
        CIERRE,
      );

      expect(created).toBe(true);
      expect(execution).toMatchObject({
        procedureId: CIERRE,
        procedureVersionId: V1.versionId,
        status: 'IN_PROGRESS',
        startedAt: new Date('2026-10-27T10:00:00.000Z'),
        finishedAt: null,
        currentStepId: V1.steps[0].id,
      });
      expect(execution.steps).toHaveLength(V1.steps.length);
      expect(execution.steps[0].startedAt).toEqual(
        new Date('2026-10-27T10:00:00.000Z'),
      );
      expect(execution.steps.slice(1).every((s) => s.startedAt === null)).toBe(
        true,
      );
    });

    it('does not expose the user id in the result', async () => {
      const { execution } = await service.start(empleadoVentas, CIERRE);

      expect(execution).not.toHaveProperty('userId');
    });

    it('starts a new execution after the previous one was completed', async () => {
      const first = await service.start(empleadoVentas, CIERRE);
      for (const step of V1.steps) {
        await service.completeStep(empleadoVentas, first.execution.id, step.id);
      }

      const second = await service.start(empleadoVentas, CIERRE);

      expect(second.created).toBe(true);
      expect(second.execution.id).not.toBe(first.execution.id);
    });

    it('returns the existing execution when the create loses a race', async () => {
      const { execution } = await service.start(empleadoVentas, CIERRE);
      // The first lookup misses it, as if the other request committed in between.
      jest.spyOn(repository, 'findInProgress').mockResolvedValueOnce(null);

      const again = await service.start(empleadoVentas, CIERRE);

      expect(again).toMatchObject({
        created: false,
        execution: { id: execution.id },
      });
    });

    it('404 for an unknown procedure', async () => {
      await expectNotFound(service.start(empleadoVentas, UNKNOWN_ID));
    });

    it('404 for a procedure of another area', async () => {
      await expectNotFound(service.start(empleadoOperaciones, CIERRE));
    });

    it('404 when the published version has no steps', async () => {
      catalog = new InMemoryProceduresCatalog([
        { ...V1, steps: [], published: true },
      ]);
      service = build();

      await expectNotFound(service.start(empleadoVentas, CIERRE));
    });

    it('404 for a user the directory does not know', async () => {
      await expectNotFound(
        service.start(
          asAuthUser({
            id: UNKNOWN_ID,
            name: 'Desconocido',
            role: 'EMPLOYEE',
            areaIds: [],
            isActive: true,
          }),
          CIERRE,
        ),
      );
    });
  });

  // ── area revalidation ─────────────────────────────────────────────────────

  describe('when the user loses the area of the procedure', () => {
    let executionId: string;

    beforeEach(async () => {
      ({
        execution: { id: executionId },
      } = await service.start(empleadoVentas, CIERRE));
      users = new InMemoryUsersDirectory([
        { ...FIXTURE_USERS.empleadoVentas, areaIds: [AREA_IDS.operaciones] },
      ]);
      service = build();
    });

    it('findOne answers the same 404 as a missing execution', async () => {
      const lost = await expectNotFound(
        service.findOne(empleadoVentas, executionId),
      );
      const missing = await expectNotFound(
        service.findOne(empleadoVentas, UNKNOWN_ID),
      );
      expect(lost).toBe(missing);
    });

    it('completeStep answers 404', async () => {
      await expectNotFound(
        service.completeStep(empleadoVentas, executionId, V1.steps[0].id),
      );
    });

    it('start does not return the execution in progress', async () => {
      await expectNotFound(service.start(empleadoVentas, CIERRE));
    });
  });

  // ── deactivated area ──────────────────────────────────────────────────────

  describe('when the only shared area is deactivated', () => {
    let executionId: string;

    beforeEach(async () => {
      ({
        execution: { id: executionId },
      } = await service.start(empleadoVentas, CIERRE));
      areas = new InMemoryAreasDirectory([
        { id: AREA_IDS.ventas, name: 'Ventas', isActive: false },
        { id: AREA_IDS.operaciones, name: 'Operaciones', isActive: true },
      ]);
      service = build();
    });

    it('findOne answers the same 404 as a missing execution', async () => {
      const inactive = await expectNotFound(
        service.findOne(empleadoVentas, executionId),
      );
      const missing = await expectNotFound(
        service.findOne(empleadoVentas, UNKNOWN_ID),
      );
      expect(inactive).toBe(missing);
    });

    it('completeStep answers 404', async () => {
      await expectNotFound(
        service.completeStep(empleadoVentas, executionId, V1.steps[0].id),
      );
    });

    it('start does not return the execution in progress', async () => {
      await expectNotFound(service.start(empleadoVentas, CIERRE));
    });

    it('start answers 404 for a user without an execution in progress', async () => {
      await expectNotFound(service.start(otroVentas, CIERRE));
    });
  });

  it('another inactive area of the user does not take away an active one', async () => {
    users = new InMemoryUsersDirectory([
      {
        ...FIXTURE_USERS.empleadoVentas,
        areaIds: [AREA_IDS.ventas, AREA_IDS.operaciones],
      },
    ]);
    areas = new InMemoryAreasDirectory([
      { id: AREA_IDS.ventas, name: 'Ventas', isActive: true },
      { id: AREA_IDS.operaciones, name: 'Operaciones', isActive: false },
    ]);
    service = build();

    const { created } = await service.start(empleadoVentas, CIERRE);

    expect(created).toBe(true);
  });

  // ── procedure moved to another area ───────────────────────────────────────

  describe('when the procedure is reassigned to another area', () => {
    let executionId: string;

    beforeEach(async () => {
      ({
        execution: { id: executionId },
      } = await service.start(empleadoVentas, CIERRE));
      catalog.assignAreas(CIERRE, [AREA_IDS.operaciones]);
    });

    it('the original user loses access to the execution in progress', async () => {
      const lost = await expectNotFound(
        service.findOne(empleadoVentas, executionId),
      );
      const missing = await expectNotFound(
        service.findOne(empleadoVentas, UNKNOWN_ID),
      );

      expect(lost).toBe(missing);
      await expectNotFound(
        service.completeStep(empleadoVentas, executionId, V1.steps[0].id),
      );
      await expectNotFound(service.start(empleadoVentas, CIERRE));
      expect(repository.completions).toHaveLength(0);
    });

    it('the check uses the current areas even for an old version', async () => {
      catalog.publish(V2.versionId);

      await expectNotFound(service.findOne(empleadoVentas, executionId));
    });
  });

  // ── error mapping ─────────────────────────────────────────────────────────

  describe('when a dependency fails', () => {
    beforeEach(() => {
      jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    });

    it('a catalog that is down is a 503 on every operation', async () => {
      const { execution } = await service.start(empleadoVentas, CIERRE);
      const down = new CatalogUnavailableError('catalog down');
      jest.spyOn(catalog, 'findPublished').mockRejectedValue(down);
      jest.spyOn(catalog, 'findVersion').mockRejectedValue(down);

      await expect(service.start(otroVentas, CIERRE)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      await expect(
        service.findOne(empleadoVentas, execution.id),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
      await expect(
        service.completeStep(empleadoVentas, execution.id, V1.steps[0].id),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    });

    it('a repository that is down is a 503', async () => {
      jest
        .spyOn(repository, 'findInProgress')
        .mockRejectedValue(new ExecutionsRepositoryUnavailableError('db down'));

      await expect(
        service.start(empleadoVentas, CIERRE),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    });

    it('an areas directory that is down is a 503', async () => {
      jest
        .spyOn(areas, 'findByIds')
        .mockRejectedValue(new RepositoryUnavailableError('db down'));

      await expect(
        service.start(empleadoVentas, CIERRE),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    });

    it('an unexpected error is a 500', async () => {
      jest
        .spyOn(repository, 'findById')
        .mockRejectedValue(new TypeError('x is undefined'));

      await expect(
        service.findOne(empleadoVentas, UNKNOWN_ID),
      ).rejects.toBeInstanceOf(InternalServerErrorException);
    });

    it('business errors keep their status: 404 and 409 with reason', async () => {
      const { execution } = await service.start(empleadoVentas, CIERRE);

      await expectNotFound(service.findOne(otroVentas, execution.id));
      await expectConflict(
        service.completeStep(empleadoVentas, execution.id, V1.steps[2].id),
        'STEP_OUT_OF_ORDER',
      );
    });
  });

  // ── completeStep ──────────────────────────────────────────────────────────

  describe('completeStep', () => {
    let executionId: string;

    beforeEach(async () => {
      ({
        execution: { id: executionId },
      } = await service.start(empleadoVentas, CIERRE));
    });

    it('runs the write inside a transaction', async () => {
      await service.completeStep(empleadoVentas, executionId, V1.steps[0].id);

      expect(repository.transactions).toHaveLength(1);
      expect(repository.completions[0].tx).toBe(repository.transactions[0]);
    });

    // Versions are immutable, so the catalog is not read while the row is locked.
    it('reads the version from the catalog before opening the transaction', async () => {
      const readsInTransaction: boolean[] = [];
      const findVersion = catalog.findVersion.bind(catalog);
      jest.spyOn(catalog, 'findVersion').mockImplementation((versionId) => {
        readsInTransaction.push(repository.inTransaction);
        return findVersion(versionId);
      });

      await service.completeStep(empleadoVentas, executionId, V1.steps[0].id);

      expect(readsInTransaction).toEqual([false]);
    });

    it('marks the end of N and starts N+1 at the same instant', async () => {
      clock.set('2026-10-27T10:05:00.000Z');
      await service.completeStep(empleadoVentas, executionId, V1.steps[0].id);

      expect(repository.completions[0].data).toEqual({
        executionId,
        stepId: V1.steps[0].id,
        finishedAt: new Date('2026-10-27T10:05:00.000Z'),
        next: { stepId: V1.steps[1].id, stepOrder: 2 },
      });
    });

    it('completes the execution after the last step', async () => {
      for (const [i, step] of V1.steps.entries()) {
        clock.set(`2026-10-27T10:0${i + 1}:00.000Z`);
        await service.completeStep(empleadoVentas, executionId, step.id);
      }

      const found = await service.findOne(empleadoVentas, executionId);
      expect(found).toMatchObject({
        status: 'COMPLETED',
        finishedAt: new Date('2026-10-27T10:03:00.000Z'),
        currentStepId: null,
      });
      expect(repository.completions.at(-1)?.data.next).toBeNull();
    });

    it('409 STEP_OUT_OF_ORDER for a later step', async () => {
      await expectConflict(
        service.completeStep(empleadoVentas, executionId, V1.steps[2].id),
        'STEP_OUT_OF_ORDER',
      );
    });

    it('409 STEP_ALREADY_FINISHED for a finished step', async () => {
      await service.completeStep(empleadoVentas, executionId, V1.steps[0].id);

      await expectConflict(
        service.completeStep(empleadoVentas, executionId, V1.steps[0].id),
        'STEP_ALREADY_FINISHED',
      );
    });

    it('409 EXECUTION_COMPLETED once the execution is completed', async () => {
      for (const step of V1.steps) {
        await service.completeStep(empleadoVentas, executionId, step.id);
      }

      await expectConflict(
        service.completeStep(empleadoVentas, executionId, V1.steps[2].id),
        'EXECUTION_COMPLETED',
      );
    });

    it('404, same message, for a step that is not in the version', async () => {
      const stepOfV2 = await expectNotFound(
        service.completeStep(empleadoVentas, executionId, V2.steps[0].id),
      );
      const missing = await expectNotFound(
        service.completeStep(empleadoVentas, UNKNOWN_ID, V1.steps[0].id),
      );

      expect(stepOfV2).toBe(missing);
      expect(repository.completions).toHaveLength(0);
    });
  });

  // ── HU33: the procedure changed while it runs ─────────────────────────────

  describe('HU33: versionChange', () => {
    // Ventas on v1 with an execution in progress; then v2 is published.
    const startOnV1 = async () =>
      (await service.start(empleadoVentas, CIERRE)).execution;
    const withV2 = (overrides: Partial<FixtureProcedureVersion> = {}) => {
      catalog = new InMemoryProceduresCatalog([
        { ...V1, published: true, superseded: false },
        { ...V2, published: false, ...overrides },
        ...FIXTURE_PROCEDURE_VERSIONS.filter((v) => v.procedureId !== CIERRE),
      ]);
      service = build();
    };

    it('a new execution starts on the current version: no change', async () => {
      const execution = await startOnV1();

      expect(execution.versionChange).toEqual({
        changed: false,
        critical: false,
        currentVersionId: null,
        currentVersionNumber: null,
        changes: [],
      });
    });

    it('opening it after v2 is published says so, with what changed', async () => {
      withV2();
      const execution = await startOnV1();
      catalog.publish(V2.versionId);

      const found = await service.findOne(empleadoVentas, execution.id);

      expect(found.procedureVersionId).toBe(V1.versionId);
      expect(found.versionChange).toEqual({
        changed: true,
        critical: false,
        currentVersionId: V2.versionId,
        currentVersionNumber: 2,
        changes: [
          {
            versionNumber: 2,
            isCritical: false,
            changeSummary: V2.changeSummary,
            publishedAt: V2.publishedAt,
          },
        ],
      });
    });

    it('resuming it (start again) says so too', async () => {
      withV2({ isCritical: true, changeSummary: 'Cambia el límite de caja' });
      await startOnV1();
      catalog.publish(V2.versionId);

      const resumed = await service.start(empleadoVentas, CIERRE);

      expect(resumed.created).toBe(false);
      expect(resumed.execution.versionChange).toMatchObject({
        changed: true,
        critical: true,
      });
    });

    it('a critical version in between is enough, though the current one is not', async () => {
      const V3 = '1b000000-0000-4000-8000-000000000009';
      withV2({ isCritical: true, changeSummary: 'Cambia el límite de caja' });
      const execution = await startOnV1();
      catalog.publish(V2.versionId);
      catalog.addVersion({
        ...V2,
        versionId: V3,
        versionNumber: 3,
        isCritical: false,
        changeSummary: 'Corrige una palabra',
        published: false,
      });
      catalog.publish(V3);

      const found = await service.findOne(empleadoVentas, execution.id);

      expect(found.versionChange).toMatchObject({
        changed: true,
        critical: true,
        currentVersionId: V3,
        currentVersionNumber: 3,
      });
      expect(found.versionChange.changes.map((c) => c.versionNumber)).toEqual([
        2, 3,
      ]);
    });

    it('a completed execution never shows a change', async () => {
      withV2();
      const execution = await startOnV1();
      for (const step of V1.steps) {
        await service.completeStep(empleadoVentas, execution.id, step.id);
      }
      catalog.publish(V2.versionId);

      const found = await service.findOne(empleadoVentas, execution.id);

      expect(found.status).toBe('COMPLETED');
      expect(found.versionChange.changed).toBe(false);
    });

    it('completing a step keeps telling a change that is not critical', async () => {
      withV2();
      const execution = await startOnV1();
      catalog.publish(V2.versionId);

      const updated = await service.completeStep(
        empleadoVentas,
        execution.id,
        V1.steps[0].id,
      );

      expect(updated.versionChange).toMatchObject({
        changed: true,
        critical: false,
      });
    });

    it('completing a step after a critical change: 409 PROCEDURE_CHANGED_CRITICAL, nothing written', async () => {
      withV2({ isCritical: true, changeSummary: 'Cambia el límite de caja' });
      const execution = await startOnV1();
      catalog.publish(V2.versionId);

      await expectConflict(
        service.completeStep(empleadoVentas, execution.id, V1.steps[0].id),
        'PROCEDURE_CHANGED_CRITICAL',
      );
      expect(repository.completions).toHaveLength(0);
    });

    it('a critical version in between blocks it too, though the current one is not critical', async () => {
      const V3 = '1b000000-0000-4000-8000-000000000009';
      withV2({ isCritical: true, changeSummary: 'Cambia el límite de caja' });
      const execution = await startOnV1();
      catalog.publish(V2.versionId);
      catalog.addVersion({
        ...V2,
        versionId: V3,
        versionNumber: 3,
        isCritical: false,
        published: false,
      });
      catalog.publish(V3);

      await expectConflict(
        service.completeStep(empleadoVentas, execution.id, V1.steps[0].id),
        'PROCEDURE_CHANGED_CRITICAL',
      );
    });

    it('a completed execution answers EXECUTION_COMPLETED, not the critical change', async () => {
      withV2({ isCritical: true, changeSummary: 'Cambia el límite de caja' });
      const execution = await startOnV1();
      for (const step of V1.steps) {
        await service.completeStep(empleadoVentas, execution.id, step.id);
      }
      catalog.publish(V2.versionId);

      await expectConflict(
        service.completeStep(empleadoVentas, execution.id, V1.steps[0].id),
        'EXECUTION_COMPLETED',
      );
    });

    it('after restarting, the new execution moves on as usual', async () => {
      withV2({ isCritical: true, changeSummary: 'Cambia el límite de caja' });
      const execution = await startOnV1();
      catalog.publish(V2.versionId);

      const fresh = await service.restart(empleadoVentas, execution.id);
      const moved = await service.completeStep(
        empleadoVentas,
        fresh.id,
        V2.steps[0].id,
      );

      expect(moved.currentStepId).toBe(V2.steps[1].id);
    });

    it('a catalog that does not answer while comparing is a 503', async () => {
      const execution = await startOnV1();
      jest
        .spyOn(catalog, 'findPublishedAfter')
        .mockRejectedValue(new CatalogUnavailableError('down'));

      await expect(
        service.findOne(empleadoVentas, execution.id),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    });
  });

  describe('HU33: restart', () => {
    // Elena on v1; then v2 is published (critical unless told otherwise).
    const onV1ThenV2 = async (isCritical = true) => {
      catalog = new InMemoryProceduresCatalog([
        { ...V1, published: true, superseded: false },
        {
          ...V2,
          published: false,
          isCritical,
          changeSummary: 'Cambia el límite de caja',
        },
        ...FIXTURE_PROCEDURE_VERSIONS.filter((v) => v.procedureId !== CIERRE),
      ]);
      service = build();
      const { execution } = await service.start(empleadoVentas, CIERRE);
      catalog.publish(V2.versionId);
      clock.set('2026-10-27T11:00:00.000Z');
      return execution;
    };

    it('closes the old one as RESTARTED and starts a new one on the current version, from step 1', async () => {
      const old = await onV1ThenV2();

      const fresh = await service.restart(empleadoVentas, old.id);

      expect(fresh).toMatchObject({
        procedureVersionId: V2.versionId,
        status: 'IN_PROGRESS',
        startedAt: new Date('2026-10-27T11:00:00.000Z'),
        currentStepId: V2.steps[0].id,
        versionChange: { changed: false },
      });
      expect(fresh.id).not.toBe(old.id);
      const closed = await service.findOne(empleadoVentas, old.id);
      expect(closed).toMatchObject({
        status: 'RESTARTED',
        finishedAt: new Date('2026-10-27T11:00:00.000Z'),
        currentStepId: null,
        versionChange: { changed: false },
      });
    });

    it('the two writes go in one transaction, on the row read again inside it', async () => {
      const old = await onV1ThenV2();

      await service.restart(empleadoVentas, old.id);

      expect(repository.restarts).toHaveLength(1);
      expect(repository.restarts[0].tx).toBe(repository.transactions.at(-1));
    });

    it('also for a change that is not critical: the employee may choose it', async () => {
      const old = await onV1ThenV2(false);

      await expect(
        service.restart(empleadoVentas, old.id),
      ).resolves.toMatchObject({ procedureVersionId: V2.versionId });
    });

    it('starting again after a restart gives the new one', async () => {
      const old = await onV1ThenV2();
      const fresh = await service.restart(empleadoVentas, old.id);

      const again = await service.start(empleadoVentas, CIERRE);

      expect(again).toMatchObject({ created: false });
      expect(again.execution.id).toBe(fresh.id);
    });

    it('two restarts at once: one wins, the other is a 409 EXECUTION_RESTARTED', async () => {
      const old = await onV1ThenV2();

      const results = await Promise.allSettled([
        service.restart(empleadoVentas, old.id),
        service.restart(empleadoVentas, old.id),
      ]);

      expect(results.map((r) => r.status).sort()).toEqual([
        'fulfilled',
        'rejected',
      ]);
      const rejected = results.find((r) => r.status === 'rejected')!;
      expect((rejected as PromiseRejectedResult).reason).toMatchObject({
        response: expect.objectContaining({
          reason: 'EXECUTION_RESTARTED',
        }) as unknown,
      });
      expect(repository.restarts).toHaveLength(1);
      expect(
        [...repository.records.values()].filter(
          (r) => r.status === 'IN_PROGRESS',
        ),
      ).toHaveLength(1);
    });

    it('a restarted execution cannot be restarted nor moved: 409 EXECUTION_RESTARTED', async () => {
      const old = await onV1ThenV2(false);
      await service.restart(empleadoVentas, old.id);

      await expectConflict(
        service.restart(empleadoVentas, old.id),
        'EXECUTION_RESTARTED',
      );
      await expectConflict(
        service.completeStep(empleadoVentas, old.id, V1.steps[0].id),
        'EXECUTION_RESTARTED',
      );
    });

    it('a completed execution cannot be restarted: 409 EXECUTION_COMPLETED', async () => {
      const { execution } = await service.start(empleadoVentas, CIERRE);
      for (const step of V1.steps) {
        await service.completeStep(empleadoVentas, execution.id, step.id);
      }
      catalog.publish(V2.versionId);

      await expectConflict(
        service.restart(empleadoVentas, execution.id),
        'EXECUTION_COMPLETED',
      );
    });

    it('without a change of version: 409 PROCEDURE_NOT_CHANGED, without writing', async () => {
      const { execution } = await service.start(empleadoVentas, CIERRE);

      await expectConflict(
        service.restart(empleadoVentas, execution.id),
        'PROCEDURE_NOT_CHANGED',
      );
      expect(repository.restarts).toHaveLength(0);
    });

    it('another employee gets the same 404 as a missing execution', async () => {
      const old = await onV1ThenV2();

      const message = await expectNotFound(service.restart(otroVentas, old.id));

      expect(message).toBe('No se encontró la ejecución');
      expect(repository.restarts).toHaveLength(0);
    });

    it('a procedure moved to another area: 404', async () => {
      const old = await onV1ThenV2();
      catalog.assignAreas(CIERRE, [AREA_IDS.operaciones]);

      await expectNotFound(service.restart(empleadoVentas, old.id));
    });

    it('a database that is down is a 503 with the restart message', async () => {
      const old = await onV1ThenV2();
      jest
        .spyOn(repository, 'restart')
        .mockRejectedValue(new ExecutionsRepositoryUnavailableError('down'));

      await expect(service.restart(empleadoVentas, old.id)).rejects.toThrow(
        'No se pudo completar el reinicio de la ejecución. Intentá de nuevo más tarde.',
      );
    });
  });
});
