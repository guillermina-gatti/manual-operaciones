import {
  BadRequestException,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { AuthUser } from '../../common/auth';
import { AREA_IDS, FIXTURE_USERS } from '../../documents/adapters/fixtures';
import { InMemoryAreasDirectory } from '../../documents/adapters/in-memory-areas-directory';
import { InMemoryUsersDirectory } from '../../documents/adapters/in-memory-users-directory';
import { RepositoryUnavailableError } from '../../documents/documents.repository';
import { AreasDirectory } from '../../documents/ports/areas-directory';
import { UsersDirectory } from '../../documents/ports/users-directory';
import { InMemoryProceduresCatalog } from '../adapters/in-memory-procedures-catalog';
import {
  FIXTURE_PROCEDURE_VERSIONS,
  PROCEDURE_IDS,
  PROCEDURE_VERSION_IDS,
} from '../adapters/procedure-fixtures';
import { ExecutionsRepositoryUnavailableError } from '../executions.repository';
import { Clock } from '../ports/clock';
import {
  ExecutionMetricsRepository,
  MetricsAggregates,
  MetricsWindow,
  MyAggregates,
} from './execution-metrics.repository';
import type { ExecutionAggregate } from './procedure-metrics';
import { MyMetricsService } from './my-metrics.service';

// ── Test doubles ────────────────────────────────────────────────────────────

// 12:00 in Buenos Aires.
const NOW = new Date('2026-11-06T15:00:00.000Z');

class FixedClock extends Clock {
  now(): Date {
    return NOW;
  }
}

// Answers what it was given and records who and which window it was asked for.
class FakeMetricsRepository extends ExecutionMetricsRepository {
  readonly calls: { userId: string; window: MetricsWindow }[] = [];
  failure: Error | null = null;

  constructor(private readonly mineResult: MyAggregates) {
    super();
  }

  aggregate(): Promise<MetricsAggregates> {
    return Promise.reject(new Error('personal metrics must not read everyone'));
  }

  mine(userId: string, window: MetricsWindow): Promise<MyAggregates> {
    this.calls.push({ userId, window });
    return this.failure
      ? Promise.reject(this.failure)
      : Promise.resolve(this.mineResult);
  }
}

// ── Fixtures ────────────────────────────────────────────────────────────────

const CIERRE_V2 = PROCEDURE_VERSION_IDS.cierreDeCajaV2;
const RECEPCION_V1 = PROCEDURE_VERSION_IDS.recepcionMercaderiaV1;
const UNKNOWN_VERSION = '1b000000-0000-4000-8000-000000000099';
const stepsOf = (versionId: string) =>
  FIXTURE_PROCEDURE_VERSIONS.find((v) => v.versionId === versionId)!.steps;

const executions = (
  procedureId: string,
  procedureVersionId: string,
  completed: number,
): ExecutionAggregate => ({
  procedureId,
  procedureVersionId,
  started: completed,
  completed,
  inProgress: 0,
  completedDurationMs: completed * 600_000,
  minCompletionMs: 600_000,
  maxCompletionMs: 600_000,
  lastStartedAt: new Date('2026-11-03T13:00:00.000Z'),
});

// Elena has two completed Cierre de caja (Ventas), and one in progress of each
// procedure: Cierre moved an hour ago, Recepción (Operaciones) two days ago.
const MINE: MyAggregates = {
  executions: [executions(PROCEDURE_IDS.cierreDeCaja, CIERRE_V2, 2)],
  steps: [],
  inProgress: [
    {
      executionId: '1e000000-0000-4000-8000-000000000001',
      procedureId: PROCEDURE_IDS.cierreDeCaja,
      procedureVersionId: CIERRE_V2,
      startedAt: new Date('2026-11-06T13:00:00.000Z'),
      currentStepId: stepsOf(CIERRE_V2)[1].id,
      currentStepOrder: 2,
      currentStepStartedAt: new Date('2026-11-06T14:00:00.000Z'),
    },
    {
      executionId: '1e000000-0000-4000-8000-000000000002',
      procedureId: PROCEDURE_IDS.recepcionMercaderia,
      procedureVersionId: RECEPCION_V1,
      startedAt: new Date('2026-11-04T13:00:00.000Z'),
      currentStepId: stepsOf(RECEPCION_V1)[0].id,
      currentStepOrder: 1,
      currentStepStartedAt: new Date('2026-11-04T13:00:00.000Z'),
    },
  ],
};

// As the real guard leaves it in request.user. The service asks the directory for the
// areas, so the ones in the session are deliberately different.
const as = (
  user: { id: string; role: AuthUser['role'] },
  sessionAreaIds: string[] = [],
): AuthUser => ({
  id: user.id,
  email: `${user.id}@fixtures.test`,
  name: `Usuario ${user.role}`,
  role: user.role,
  areaIds: sessionAreaIds,
});
const ELENA = as(FIXTURE_USERS.empleadoVentas, [AREA_IDS.operaciones]);

describe('MyMetricsService', () => {
  let users: UsersDirectory;
  let areas: AreasDirectory;
  let catalog: InMemoryProceduresCatalog;
  let repository: FakeMetricsRepository;
  const build = () =>
    new MyMetricsService(users, areas, catalog, repository, new FixedClock());

  beforeEach(() => {
    users = new InMemoryUsersDirectory();
    areas = new InMemoryAreasDirectory();
    catalog = new InMemoryProceduresCatalog();
    repository = new FakeMetricsRepository(MINE);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('only their own data', () => {
    it('asks the repository only for the user of the session', async () => {
      await build().mine(ELENA, {});

      expect(repository.calls.map((c) => c.userId)).toEqual([
        FIXTURE_USERS.empleadoVentas.id,
      ]);
    });

    it('the areas come from the directory, not from the session', async () => {
      const view = await build().mine(ELENA, {});

      expect(view.areaIds).toEqual([AREA_IDS.ventas]);
      expect(view.procedures.map((p) => p.procedureId)).toEqual([
        PROCEDURE_IDS.cierreDeCaja,
      ]);
    });

    it('the totals and the average are those of their executions', async () => {
      const view = await build().mine(ELENA, {});

      expect(view.totals).toEqual({
        started: 2,
        completed: 2,
        inProgress: 0,
        abandoned: 0,
        avgCompletionMs: 600_000,
      });
    });
  });

  describe('to resume', () => {
    it('lists their execution in progress with its current step', async () => {
      const view = await build().mine(ELENA, {});

      expect(view.resume).toEqual([
        {
          executionId: '1e000000-0000-4000-8000-000000000001',
          procedureId: PROCEDURE_IDS.cierreDeCaja,
          procedureVersionId: CIERRE_V2,
          currentStep: {
            stepId: stepsOf(CIERRE_V2)[1].id,
            order: 2,
            title: stepsOf(CIERRE_V2)[1].title,
          },
          totalSteps: stepsOf(CIERRE_V2).length,
          startedAt: new Date('2026-11-06T13:00:00.000Z'),
          lastActivityAt: new Date('2026-11-06T14:00:00.000Z'),
          stale: false,
        },
      ]);
    });

    it('leaves out an execution whose procedure is not in their areas (it would 404)', async () => {
      const view = await build().mine(ELENA, {});

      expect(view.resume.map((r) => r.procedureId)).not.toContain(
        PROCEDURE_IDS.recepcionMercaderia,
      );
    });

    it('marks as stale one without progress for more than 24 hours', async () => {
      catalog.assignAreas(PROCEDURE_IDS.recepcionMercaderia, [AREA_IDS.ventas]);

      const view = await build().mine(ELENA, {});

      const recepcion = view.resume.find(
        (r) => r.procedureId === PROCEDURE_IDS.recepcionMercaderia,
      );
      expect(recepcion?.stale).toBe(true);
    });

    it('a version the catalog does not know is left out and logged', async () => {
      const warn = jest.spyOn(Logger.prototype, 'warn');
      repository = new FakeMetricsRepository({
        ...MINE,
        inProgress: [
          { ...MINE.inProgress[0], procedureVersionId: UNKNOWN_VERSION },
        ],
      });

      const view = await build().mine(ELENA, {});

      expect(view.resume).toEqual([]);
      expect(warn).toHaveBeenCalledWith(
        expect.objectContaining({ procedureVersionId: UNKNOWN_VERSION }),
      );
    });
  });

  describe('areas', () => {
    it('one of their areas: only that one', async () => {
      const view = await build().mine(ELENA, { areaId: AREA_IDS.ventas });

      expect(view.filters.areaId).toBe(AREA_IDS.ventas);
      expect(view.procedures).toHaveLength(1);
    });

    it('an area that is not theirs is a 404, without reading their executions', async () => {
      await expect(
        build().mine(ELENA, { areaId: AREA_IDS.operaciones }),
      ).rejects.toThrow(new NotFoundException('No se encontró el área'));
      expect(repository.calls).toEqual([]);
    });

    it('an inactive area of theirs is also a 404', async () => {
      areas = new InMemoryAreasDirectory([
        { id: AREA_IDS.ventas, name: 'Ventas', isActive: false },
        { id: AREA_IDS.operaciones, name: 'Operaciones', isActive: true },
      ]);

      await expect(
        build().mine(ELENA, { areaId: AREA_IDS.ventas }),
      ).rejects.toThrow(new NotFoundException('No se encontró el área'));
    });

    it('with their only area inactive, they see nothing', async () => {
      areas = new InMemoryAreasDirectory([
        { id: AREA_IDS.ventas, name: 'Ventas', isActive: false },
      ]);

      const view = await build().mine(ELENA, {});

      expect(view.areaIds).toEqual([]);
      expect(view.procedures).toEqual([]);
      expect(view.resume).toEqual([]);
    });
  });

  describe('period', () => {
    it('the days are those of Buenos Aires, both inclusive', async () => {
      await build().mine(ELENA, { from: '2026-11-01', to: '2026-11-06' });

      expect(repository.calls[0].window).toEqual({
        from: new Date('2026-11-01T03:00:00.000Z'),
        to: new Date('2026-11-07T03:00:00.000Z'),
        staleBefore: new Date('2026-11-05T15:00:00.000Z'),
      });
    });

    it('from after to is a 400, without reading anything', async () => {
      await expect(
        build().mine(ELENA, { from: '2026-11-06', to: '2026-11-01' }),
      ).rejects.toThrow(
        new BadRequestException(
          'La fecha de inicio no puede ser posterior a la fecha de fin',
        ),
      );
      expect(repository.calls).toEqual([]);
    });
  });

  describe('errors', () => {
    const UNAVAILABLE =
      'No se pudo completar la consulta de las métricas. Intentá de nuevo más tarde.';

    it('the database down is a 503', async () => {
      repository.failure = new ExecutionsRepositoryUnavailableError('down');

      await expect(build().mine(ELENA, {})).rejects.toThrow(
        new ServiceUnavailableException(UNAVAILABLE),
      );
    });

    it('the users directory down is a 503, without reading their executions', async () => {
      users = {
        findById: () => Promise.reject(new RepositoryUnavailableError('down')),
      };

      await expect(build().mine(ELENA, {})).rejects.toThrow(
        new ServiceUnavailableException(UNAVAILABLE),
      );
      expect(repository.calls).toEqual([]);
    });

    it('any other error is a 500, with the cause only in the log', async () => {
      const logError = jest.spyOn(Logger.prototype, 'error');
      repository.failure = new Error('column does not exist');

      const failure = await build()
        .mine(ELENA, {})
        .catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(InternalServerErrorException);
      expect(logError).toHaveBeenCalled();
    });
  });
});
