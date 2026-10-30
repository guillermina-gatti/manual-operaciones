/* Pruebas del caso de uso de las métricas de documentos (spec 007, R2 a R9; plan 3; T05) */
import {
  BadRequestException,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { AuthUser } from '../../common/auth';
import { Clock } from '../../common/clock';
import { AREA_IDS, FIXTURE_USERS } from '../adapters/fixtures';
import { InMemoryUsersDirectory } from '../adapters/in-memory-users-directory';
import { RepositoryUnavailableError } from '../documents.repository';
import { UsersDirectory } from '../ports/users-directory';
import {
  DocumentMetricsQuery,
  DocumentMetricsRepository,
  DocumentMetricsTotals,
} from './document-metrics.repository';
import { DocumentMetricsService } from './document-metrics.service';

// 23:30 del 9/11 en Argentina; en UTC ya es el 10/11 (D5 del plan 005).
class FixedClock extends Clock {
  now(): Date {
    return new Date('2026-11-10T02:30:00.000Z');
  }
}

// Devuelve los totales que recibió y guarda lo que le pidieron.
class FakeMetricsRepository extends DocumentMetricsRepository {
  readonly queries: DocumentMetricsQuery[] = [];
  failure: Error | null = null;

  constructor(private readonly result: DocumentMetricsTotals) {
    super();
  }

  totals(query: DocumentMetricsQuery): Promise<DocumentMetricsTotals> {
    this.queries.push(query);
    return this.failure
      ? Promise.reject(this.failure)
      : Promise.resolve({ ...this.result });
  }
}

const TOTALS: DocumentMetricsTotals = {
  active: 3,
  upToDate: 1,
  dueSoon: 1,
  overdue: 1,
  processingFailed: 0,
  uploaded: 3,
};
const UNKNOWN_AREA = '0a000000-0000-4000-8000-000000000099';

// Como lo deja el guard en request.user. Las áreas de la sesión son a propósito distintas de las del
// directorio: el servicio tiene que usar las del directorio (R2).
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
const ADMIN = as(FIXTURE_USERS.admin);
const SUPERVISOR_VENTAS = as(FIXTURE_USERS.supervisorVentas, [
  AREA_IDS.operaciones,
]);

describe('DocumentMetricsService', () => {
  let users: UsersDirectory;
  let repository: FakeMetricsRepository;
  const build = () =>
    new DocumentMetricsService(users, repository, new FixedClock());

  beforeEach(() => {
    users = new InMemoryUsersDirectory();
    repository = new FakeMetricsRepository(TOTALS);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('alcance (R2, R3)', () => {
    it('E1: el ADMIN cuenta todas las áreas, con hoy en hora de Argentina', async () => {
      const view = await build().documents(ADMIN, {});

      expect(repository.queries).toEqual([
        {
          areaIds: null,
          today: '2026-11-09',
          dueSoonThrough: '2026-12-09',
          uploadedFrom: null,
          uploadedTo: null,
        },
      ]);
      expect(view).toEqual({
        filters: { areaId: null, from: null, to: null },
        totals: TOTALS,
      });
    });

    it('E2: el SUPERVISOR cuenta las áreas del directorio, no las de la sesión', async () => {
      await build().documents(SUPERVISOR_VENTAS, {});

      expect(repository.queries[0].areaIds).toEqual([AREA_IDS.ventas]);
    });

    it('E3: el ADMIN con un área cuenta solo esa y la repite en filters', async () => {
      const view = await build().documents(ADMIN, {
        areaId: AREA_IDS.operaciones,
      });

      expect(repository.queries[0].areaIds).toEqual([AREA_IDS.operaciones]);
      expect(view.filters).toEqual({
        areaId: AREA_IDS.operaciones,
        from: null,
        to: null,
      });
    });

    it('el SUPERVISOR con una de sus áreas cuenta solo esa', async () => {
      await build().documents(SUPERVISOR_VENTAS, { areaId: AREA_IDS.ventas });

      expect(repository.queries[0].areaIds).toEqual([AREA_IDS.ventas]);
    });

    it('E4: el SUPERVISOR con un área ajena recibe 404, sin contar nada', async () => {
      await expect(
        build().documents(SUPERVISOR_VENTAS, { areaId: AREA_IDS.operaciones }),
      ).rejects.toThrow(new NotFoundException('No se encontró el área'));
      expect(repository.queries).toEqual([]);
    });

    it('E4: el SUPERVISOR con un área que no existe recibe el mismo 404', async () => {
      await expect(
        build().documents(SUPERVISOR_VENTAS, { areaId: UNKNOWN_AREA }),
      ).rejects.toThrow(new NotFoundException('No se encontró el área'));
      expect(repository.queries).toEqual([]);
    });

    it('E4 (D14): el ADMIN con un área que no existe cuenta esa área, sin 404', async () => {
      const view = await build().documents(ADMIN, { areaId: UNKNOWN_AREA });

      expect(repository.queries[0].areaIds).toEqual([UNKNOWN_AREA]);
      expect(view.filters.areaId).toBe(UNKNOWN_AREA);
    });

    it('un usuario que el directorio no conoce no tiene áreas', async () => {
      users = new InMemoryUsersDirectory([]);

      await build().documents(SUPERVISOR_VENTAS, {});

      expect(repository.queries[0].areaIds).toEqual([]);
    });
  });

  describe('período (R6, R7)', () => {
    it('E9: los días de la empresa llegan como instantes, [from, to)', async () => {
      const view = await build().documents(ADMIN, {
        from: '2026-10-10',
        to: '2026-10-31',
      });

      expect(repository.queries[0]).toMatchObject({
        uploadedFrom: new Date('2026-10-10T03:00:00.000Z'),
        uploadedTo: new Date('2026-11-01T03:00:00.000Z'),
      });
      expect(view.filters).toEqual({
        areaId: null,
        from: '2026-10-10',
        to: '2026-10-31',
      });
    });

    it('E10: from posterior a to es 400, sin leer el directorio ni la base', async () => {
      const findById = jest.spyOn(users, 'findById');

      await expect(
        build().documents(ADMIN, { from: '2026-10-31', to: '2026-10-01' }),
      ).rejects.toThrow(
        new BadRequestException(
          'La fecha de inicio no puede ser posterior a la fecha de fin',
        ),
      );
      expect(findById).not.toHaveBeenCalled();
      expect(repository.queries).toEqual([]);
    });

    it('el mismo día como inicio y fin es válido', async () => {
      await expect(
        build().documents(ADMIN, { from: '2026-10-31', to: '2026-10-31' }),
      ).resolves.toBeDefined();
    });
  });

  describe('errores (R9)', () => {
    const UNAVAILABLE =
      'No se pudo completar la consulta de las métricas. Intentá de nuevo más tarde.';

    it('la base caída es 503', async () => {
      repository.failure = new RepositoryUnavailableError('base caída');

      await expect(build().documents(ADMIN, {})).rejects.toThrow(
        new ServiceUnavailableException(UNAVAILABLE),
      );
    });

    it('el directorio de usuarios caído es 503, sin contar nada', async () => {
      users = {
        findById: () =>
          Promise.reject(new RepositoryUnavailableError('directorio caído')),
      };

      await expect(build().documents(ADMIN, {})).rejects.toThrow(
        new ServiceUnavailableException(UNAVAILABLE),
      );
      expect(repository.queries).toEqual([]);
    });

    it('cualquier otro error es 500, con la causa solo en el log', async () => {
      const logError = jest.spyOn(Logger.prototype, 'error');
      repository.failure = new Error('columna inexistente');

      const failure = await build()
        .documents(ADMIN, {})
        .catch((error: unknown) => error);

      expect(failure).toEqual(
        new InternalServerErrorException(
          'No se pudo completar la consulta de las métricas.',
        ),
      );
      expect(logError).toHaveBeenCalledWith(
        expect.objectContaining({ cause: 'columna inexistente' }),
      );
    });
  });
});
