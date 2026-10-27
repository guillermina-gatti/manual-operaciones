import { ConflictException, NotFoundException } from '@nestjs/common';
import type { AuthUser } from '../common/auth';
import { AREA_IDS, FIXTURE_USERS } from '../documents/adapters/fixtures';
import { InMemoryUsersDirectory } from '../documents/adapters/in-memory-users-directory';
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
  ExecutionInProgressError,
  ExecutionRecord,
  ExecutionsRepository,
  NewExecution,
  RepositoryTransaction,
  StepCompletion,
} from './executions.repository';
import { Clock } from './ports/clock';

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

  runInTransaction<T>(
    fn: (tx: RepositoryTransaction) => Promise<T>,
  ): Promise<T> {
    const tx = {
      id: this.transactions.length,
    } as unknown as RepositoryTransaction;
    this.transactions.push(tx);
    return fn(tx);
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
}

const copy = (record: ExecutionRecord): ExecutionRecord => ({
  ...record,
  steps: record.steps.map((s) => ({ ...s })),
});

// ── Fixtures ────────────────────────────────────────────────────────────────

const empleadoVentas: AuthUser = {
  id: FIXTURE_USERS.empleadoVentas.id,
  role: 'EMPLOYEE',
};
// A second Ventas employee, so CA4 fails on ownership and not on areas.
const otroEmpleadoVentas: DirectoryUser = {
  id: '0b000000-0000-4000-8000-000000000099',
  role: 'EMPLOYEE',
  areaIds: [AREA_IDS.ventas],
};
const otroVentas: AuthUser = { id: otroEmpleadoVentas.id, role: 'EMPLOYEE' };
const empleadoOperaciones: AuthUser = {
  id: FIXTURE_USERS.empleadoOperaciones.id,
  role: 'EMPLOYEE',
};

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
  let repository: FakeExecutionsRepository;
  let clock: FakeClock;
  let service: ExecutionService;

  const build = () => new ExecutionService(users, catalog, repository, clock);

  beforeEach(() => {
    catalog = new InMemoryProceduresCatalog(catalogOnV1());
    users = new InMemoryUsersDirectory([
      ...Object.values(FIXTURE_USERS),
      otroEmpleadoVentas,
    ]);
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
        service.start({ id: UNKNOWN_ID, role: 'EMPLOYEE' }, CIERRE),
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
});
