import {
  BadRequestException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { AuthUser } from '../../common/auth';
import { AREA_IDS, FIXTURE_USERS } from '../../documents/adapters/fixtures';
import { InMemoryUsersDirectory } from '../../documents/adapters/in-memory-users-directory';
import { RepositoryUnavailableError } from '../../documents/documents.repository';
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
} from './execution-metrics.repository';
import type { ExecutionAggregate } from './procedure-metrics';
import { ProcedureMetricsService } from './procedure-metrics.service';

// ── Test doubles ────────────────────────────────────────────────────────────

class FixedClock extends Clock {
  now(): Date {
    return new Date('2026-10-27T15:00:00.000Z');
  }
}

// Returns the aggregates it was given and remembers the window it was asked for.
class FakeMetricsRepository extends ExecutionMetricsRepository {
  readonly windows: MetricsWindow[] = [];
  failure: Error | null = null;

  constructor(private readonly aggregates: MetricsAggregates) {
    super();
  }

  aggregate(window: MetricsWindow): Promise<MetricsAggregates> {
    this.windows.push(window);
    return this.failure
      ? Promise.reject(this.failure)
      : Promise.resolve(this.aggregates);
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
  started: number,
): ExecutionAggregate => ({
  procedureId,
  procedureVersionId,
  started,
  completed: started,
  inProgress: 0,
  completedDurationMs: started * 600_000,
  lastStartedAt: new Date('2026-10-20T13:00:00.000Z'),
});

// Cierre de caja (Ventas) with 2 executions and Recepción (Operaciones) with 1.
const AGGREGATES: MetricsAggregates = {
  executions: [
    executions(PROCEDURE_IDS.cierreDeCaja, CIERRE_V2, 2),
    executions(PROCEDURE_IDS.recepcionMercaderia, RECEPCION_V1, 1),
  ],
  steps: [
    {
      procedureVersionId: CIERRE_V2,
      stepId: stepsOf(CIERRE_V2)[0].id,
      reached: 2,
      finished: 2,
      finishedDurationMs: 360_000,
      abandoned: 0,
    },
  ],
};

const as = (user: { id: string; role: AuthUser['role'] }): AuthUser => ({
  id: user.id,
  role: user.role,
});
const ADMIN = as(FIXTURE_USERS.admin);
const SUPERVISOR_VENTAS = as(FIXTURE_USERS.supervisorVentas);

describe('ProcedureMetricsService', () => {
  let users: UsersDirectory;
  let catalog: InMemoryProceduresCatalog;
  let repository: FakeMetricsRepository;
  const build = () =>
    new ProcedureMetricsService(users, catalog, repository, new FixedClock());
  const procedureIds = (view: { procedures: { procedureId: string }[] }) =>
    view.procedures.map((p) => p.procedureId);

  beforeEach(() => {
    users = new InMemoryUsersDirectory();
    catalog = new InMemoryProceduresCatalog();
    repository = new FakeMetricsRepository(AGGREGATES);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('who sees what', () => {
    it('ADMIN sees every procedure and may filter by any area', async () => {
      const view = await build().procedures(ADMIN, {});

      expect(procedureIds(view)).toEqual([
        PROCEDURE_IDS.cierreDeCaja,
        PROCEDURE_IDS.recepcionMercaderia,
      ]);
      expect(view.areaIds).toBeNull();
      expect(view.totals).toEqual({
        started: 3,
        completed: 3,
        inProgress: 0,
        abandoned: 0,
        completionRate: 1,
      });
    });

    it('ADMIN with an area sees only the procedures of that area', async () => {
      const view = await build().procedures(ADMIN, {
        areaId: AREA_IDS.operaciones,
      });

      expect(procedureIds(view)).toEqual([PROCEDURE_IDS.recepcionMercaderia]);
      expect(view.totals.started).toBe(1);
    });

    it('a supervisor of Ventas does not see the procedures of Operaciones', async () => {
      const view = await build().procedures(SUPERVISOR_VENTAS, {});

      expect(procedureIds(view)).toEqual([PROCEDURE_IDS.cierreDeCaja]);
      expect(view.areaIds).toEqual([AREA_IDS.ventas]);
      expect(view.totals.started).toBe(2);
    });

    it('a supervisor of Ventas filtering by Ventas sees the same', async () => {
      const view = await build().procedures(SUPERVISOR_VENTAS, {
        areaId: AREA_IDS.ventas,
      });

      expect(procedureIds(view)).toEqual([PROCEDURE_IDS.cierreDeCaja]);
    });

    it('a supervisor of Ventas asking for Operaciones gets a 404, without reading metrics', async () => {
      await expect(
        build().procedures(SUPERVISOR_VENTAS, {
          areaId: AREA_IDS.operaciones,
        }),
      ).rejects.toThrow(new NotFoundException('No se encontró el área'));
      expect(repository.windows).toEqual([]);
    });

    it('the areas are those of the directory now: a procedure moved away is no longer seen', async () => {
      catalog.assignAreas(PROCEDURE_IDS.cierreDeCaja, [AREA_IDS.operaciones]);

      const view = await build().procedures(SUPERVISOR_VENTAS, {});

      expect(view.procedures).toEqual([]);
      expect(view.totals.completionRate).toBeNull();
    });

    it('a supervisor the directory does not know sees nothing', async () => {
      users = new InMemoryUsersDirectory([]);

      const view = await build().procedures(SUPERVISOR_VENTAS, {});

      expect(view.procedures).toEqual([]);
      expect(view.areaIds).toEqual([]);
    });
  });

  describe('period', () => {
    it('asks for the company days as instants and 24 hours back for abandonment', async () => {
      await build().procedures(ADMIN, { from: '2026-10-01', to: '2026-10-27' });

      expect(repository.windows).toEqual([
        {
          from: new Date('2026-10-01T03:00:00.000Z'),
          to: new Date('2026-10-28T03:00:00.000Z'),
          staleBefore: new Date('2026-10-26T15:00:00.000Z'),
        },
      ]);
    });

    it('without dates has no limits', async () => {
      await build().procedures(ADMIN, {});

      expect(repository.windows[0]).toMatchObject({ from: null, to: null });
    });

    it('echoes the filters and the abandonment threshold', async () => {
      const view = await build().procedures(ADMIN, {
        areaId: AREA_IDS.ventas,
        from: '2026-10-01',
      });

      expect(view.filters).toEqual({
        areaId: AREA_IDS.ventas,
        from: '2026-10-01',
        to: null,
      });
      expect(view.staleAfterHours).toBe(24);
    });

    it('a start after the end is a 400, without reading metrics', async () => {
      await expect(
        build().procedures(ADMIN, { from: '2026-10-28', to: '2026-10-27' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(repository.windows).toEqual([]);
    });

    it('the same day as start and end is valid', async () => {
      await expect(
        build().procedures(ADMIN, { from: '2026-10-27', to: '2026-10-27' }),
      ).resolves.toBeDefined();
    });
  });

  it('leaves out and logs a version the catalog does not know', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn');
    repository = new FakeMetricsRepository({
      executions: [
        ...AGGREGATES.executions,
        executions(PROCEDURE_IDS.cierreDeCaja, UNKNOWN_VERSION, 5),
      ],
      steps: AGGREGATES.steps,
    });

    const view = await build().procedures(ADMIN, {});

    expect(view.totals.started).toBe(3);
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ procedureVersionId: UNKNOWN_VERSION }),
    );
  });

  describe('errors', () => {
    it('a database that is down is a 503', async () => {
      repository.failure = new ExecutionsRepositoryUnavailableError('caída');

      await expect(build().procedures(ADMIN, {})).rejects.toThrow(
        new ServiceUnavailableException(
          'No se pudo completar la consulta de las métricas. Intentá de nuevo más tarde.',
        ),
      );
    });

    it('a users directory that is down is a 503', async () => {
      users = {
        findById: () =>
          Promise.reject(new RepositoryUnavailableError('directorio caído')),
      };

      await expect(build().procedures(ADMIN, {})).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });
  });
});
