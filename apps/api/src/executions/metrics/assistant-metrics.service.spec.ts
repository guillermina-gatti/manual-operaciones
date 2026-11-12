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
import { ExecutionsRepositoryUnavailableError } from '../executions.repository';
import type { AssistantAggregate } from './assistant-metrics';
import {
  AssistantMetricsRepository,
  AssistantMetricsWindow,
} from './assistant-metrics.repository';
import { AssistantMetricsService } from './assistant-metrics.service';

// Returns the aggregate it was given and remembers the window it was asked for.
class FakeAssistantMetricsRepository extends AssistantMetricsRepository {
  readonly windows: AssistantMetricsWindow[] = [];
  failure: Error | null = null;

  constructor(private readonly aggregate: AssistantAggregate) {
    super();
  }

  totals(window: AssistantMetricsWindow): Promise<AssistantAggregate> {
    this.windows.push(window);
    return this.failure
      ? Promise.reject(this.failure)
      : Promise.resolve(this.aggregate);
  }
}

const AGGREGATE: AssistantAggregate = {
  answered: 5,
  noInfo: 2,
  conflict: 1,
  aiUnavailable: 1,
  smallTalk: 3,
  latencyP50Ms: 2000,
  latencyP95Ms: 5000.5,
  inputTokens: 9000,
  outputTokens: 1500,
  useful: 4,
  notUseful: 1,
};

// As the real guard leaves it in request.user. The service still asks the directory
// for the areas, so the ones here only complete the shape.
const as = (user: {
  id: string;
  role: AuthUser['role'];
  areaIds: readonly string[];
}): AuthUser => ({
  id: user.id,
  email: `${user.id}@fixtures.test`,
  name: `Usuario ${user.role}`,
  role: user.role,
  areaIds: [...user.areaIds],
});
const ADMIN = as(FIXTURE_USERS.admin);
const SUPERVISOR_VENTAS = as(FIXTURE_USERS.supervisorVentas);
const EMPLEADO_VENTAS = as(FIXTURE_USERS.empleadoVentas);

describe('AssistantMetricsService', () => {
  let users: UsersDirectory;
  let areas: AreasDirectory;
  let repository: FakeAssistantMetricsRepository;
  const build = () => new AssistantMetricsService(users, areas, repository);
  const scopes = () => repository.windows.map((w) => w.scope);

  beforeEach(() => {
    users = new InMemoryUsersDirectory();
    areas = new InMemoryAreasDirectory();
    repository = new FakeAssistantMetricsRepository(AGGREGATE);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('who sees what', () => {
    it('ADMIN without an area: every question', async () => {
      await build().assistant(ADMIN, {});

      expect(scopes()).toEqual([{ all: true }]);
    });

    it('ADMIN with an area: the questions of that area, any area', async () => {
      await build().assistant(ADMIN, { areaId: AREA_IDS.operaciones });

      expect(scopes()).toEqual([
        { all: false, areaIds: [AREA_IDS.operaciones] },
      ]);
    });

    it('SUPERVISOR without an area: the questions of their areas', async () => {
      await build().assistant(SUPERVISOR_VENTAS, {});

      expect(scopes()).toEqual([{ all: false, areaIds: [AREA_IDS.ventas] }]);
    });

    it('SUPERVISOR with their own area', async () => {
      await build().assistant(SUPERVISOR_VENTAS, { areaId: AREA_IDS.ventas });

      expect(scopes()).toEqual([{ all: false, areaIds: [AREA_IDS.ventas] }]);
    });

    it('SUPERVISOR with an area that is not theirs: 404, without reading', async () => {
      await expect(
        build().assistant(SUPERVISOR_VENTAS, { areaId: AREA_IDS.operaciones }),
      ).rejects.toThrow(NotFoundException);
      expect(repository.windows).toEqual([]);
    });

    it('SUPERVISOR whose area was deactivated: nothing, and that area is a 404', async () => {
      areas = new InMemoryAreasDirectory([
        { id: AREA_IDS.ventas, name: 'Ventas', isActive: false },
        { id: AREA_IDS.operaciones, name: 'Operaciones', isActive: true },
      ]);

      await build().assistant(SUPERVISOR_VENTAS, {});
      expect(scopes()).toEqual([{ all: false, areaIds: [] }]);

      await expect(
        build().assistant(SUPERVISOR_VENTAS, { areaId: AREA_IDS.ventas }),
      ).rejects.toThrow(NotFoundException);
    });

    it('the areas come from the directory, not from the session', async () => {
      await build().assistant(
        { ...SUPERVISOR_VENTAS, areaIds: [AREA_IDS.operaciones] },
        {},
      );

      expect(scopes()).toEqual([{ all: false, areaIds: [AREA_IDS.ventas] }]);
    });

    it('EMPLOYEE: 404, as in the procedures metrics (the guard answers 403 before)', async () => {
      await expect(build().assistant(EMPLEADO_VENTAS, {})).rejects.toThrow(
        NotFoundException,
      );
      expect(repository.windows).toEqual([]);
    });
  });

  describe('period', () => {
    it('days of Buenos Aires, both inclusive', async () => {
      await build().assistant(ADMIN, { from: '2026-10-01', to: '2026-10-27' });

      expect(repository.windows[0]).toMatchObject({
        from: new Date('2026-10-01T03:00:00.000Z'),
        to: new Date('2026-10-28T03:00:00.000Z'),
      });
    });

    it('without dates, no limit', async () => {
      await build().assistant(ADMIN, {});

      expect(repository.windows[0]).toMatchObject({ from: null, to: null });
    });

    it('from after to: 400, without reading', async () => {
      await expect(
        build().assistant(ADMIN, { from: '2026-10-28', to: '2026-10-27' }),
      ).rejects.toThrow(BadRequestException);
      expect(repository.windows).toEqual([]);
    });

    it('the same day as from and to is allowed', async () => {
      await build().assistant(ADMIN, { from: '2026-10-27', to: '2026-10-27' });

      expect(repository.windows).toHaveLength(1);
    });
  });

  it('gives the filters it applied and the totals', async () => {
    const view = await build().assistant(ADMIN, {
      areaId: AREA_IDS.ventas,
      from: '2026-10-01',
    });

    expect(view).toEqual({
      filters: { areaId: AREA_IDS.ventas, from: '2026-10-01', to: null },
      totals: {
        questions: 9,
        answered: 5,
        noInfo: 2,
        conflict: 1,
        aiUnavailable: 1,
        smallTalk: 3,
        latencyP50Ms: 2000,
        latencyP95Ms: 5001,
        inputTokens: 9000,
        outputTokens: 1500,
        feedback: { useful: 4, notUseful: 1 },
      },
    });
  });

  describe('errors', () => {
    it('the database down: 503', async () => {
      repository.failure = new ExecutionsRepositoryUnavailableError('caída');

      await expect(build().assistant(ADMIN, {})).rejects.toThrow(
        ServiceUnavailableException,
      );
    });

    it('the users directory down: 503', async () => {
      jest
        .spyOn(users, 'findById')
        .mockRejectedValue(new RepositoryUnavailableError('caída'));

      await expect(build().assistant(ADMIN, {})).rejects.toThrow(
        ServiceUnavailableException,
      );
    });

    it('anything else: 500, without the cause in the message', async () => {
      repository.failure = new Error('column "x" does not exist');

      const error: unknown = await build()
        .assistant(ADMIN, {})
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(InternalServerErrorException);
      expect((error as Error).message).not.toContain('column');
    });
  });
});
