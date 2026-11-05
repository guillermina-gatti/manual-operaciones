/* Spec 011 (T08, R14 a R16): listar y resolver las alertas de contradicción */
import {
  ConflictException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { AuthUser } from '../../common/auth';
import { Clock } from '../../common/clock';
import { FIXTURE_USERS } from '../adapters/fixtures';
import { InMemoryUsersDirectory } from '../adapters/in-memory-users-directory';
import { RepositoryUnavailableError } from '../documents.repository';
import { AuditEntry, AuditLog } from '../ports/audit-log';
import {
  ConflictAlertPage,
  ConflictAlertRecord,
  ConflictAlertsRepository,
  ListConflictAlertsFilter,
} from './conflict-alerts.repository';
import { ConflictAlertsService } from './conflict-alerts.service';

const NOW = new Date('2026-11-08T15:00:00.000Z');
const ALERT_ID = '0c000000-0000-4000-8000-000000000001';
const DOC_A = '0d000000-0000-4000-8000-00000000000a';
const DOC_B = '0d000000-0000-4000-8000-00000000000b';

class FixedClock extends Clock {
  now(): Date {
    return new Date(NOW);
  }
}

class RecordingAuditLog extends AuditLog {
  entries: AuditEntry[] = [];
  record(entry: AuditEntry): Promise<void> {
    this.entries.push(entry);
    return Promise.resolve();
  }
}

function alert(
  overrides: Partial<ConflictAlertRecord> = {},
): ConflictAlertRecord {
  return {
    id: ALERT_ID,
    status: 'OPEN',
    a: {
      documentId: DOC_A,
      title: 'Manual de compras',
      documentStatus: 'ACTIVE',
      versionNumber: 2,
      isCurrentVersion: true,
      section: 'Aprobaciones',
    },
    b: {
      documentId: DOC_B,
      title: 'Política de gastos',
      documentStatus: 'ACTIVE',
      versionNumber: 1,
      isCurrentVersion: true,
      section: null,
    },
    question: '¿Quién aprueba una compra de $800.000?',
    firstDetectedAt: new Date('2026-11-05T13:00:00.000Z'),
    lastDetectedAt: new Date('2026-11-07T13:00:00.000Z'),
    occurrences: 3,
    resolvedAt: null,
    resolvedById: null,
    resolutionNote: null,
    ...overrides,
  };
}

class FakeAlertsRepository extends ConflictAlertsRepository {
  alerts = new Map<string, ConflictAlertRecord>([[ALERT_ID, alert()]]);
  lists: ListConflictAlertsFilter[] = [];
  failure: Error | null = null;

  list(filter: ListConflictAlertsFilter): Promise<ConflictAlertPage> {
    this.lists.push(filter);
    if (this.failure) return Promise.reject(this.failure);
    const all = [...this.alerts.values()];
    return Promise.resolve({
      items: all.filter((a) => a.status === filter.status),
      total: all.filter((a) => a.status === filter.status).length,
      openTotal: all.filter((a) => a.status === 'OPEN').length,
    });
  }

  findById(id: string): Promise<ConflictAlertRecord | null> {
    if (this.failure) return Promise.reject(this.failure);
    return Promise.resolve(this.alerts.get(id) ?? null);
  }

  resolve(
    id: string,
    by: string,
    note: string | null,
    at: Date,
  ): Promise<boolean> {
    if (this.failure) return Promise.reject(this.failure);
    const found = this.alerts.get(id);
    if (!found || found.status !== 'OPEN') return Promise.resolve(false);
    this.alerts.set(id, {
      ...found,
      status: 'RESOLVED',
      resolvedAt: at,
      resolvedById: by,
      resolutionNote: note,
    });
    return Promise.resolve(true);
  }
}

const ADMIN: AuthUser = {
  id: FIXTURE_USERS.admin.id,
  email: 'admin@fixtures.test',
  name: 'Ana Administradora',
  role: 'ADMIN',
  areaIds: [],
};

describe('ConflictAlertsService (spec 011)', () => {
  let repository: FakeAlertsRepository;
  let audit: RecordingAuditLog;
  let users: InMemoryUsersDirectory;
  const build = () =>
    new ConflictAlertsService(repository, users, audit, new FixedClock());

  beforeEach(() => {
    repository = new FakeAlertsRepository();
    audit = new RecordingAuditLog();
    users = new InMemoryUsersDirectory();
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('list (R14)', () => {
    it('E11: la página, los totales y los dos documentos, sin quién preguntó', async () => {
      const page = await build().list({ status: 'OPEN', page: 1, limit: 20 });

      expect(repository.lists).toEqual([
        { status: 'OPEN', page: 1, limit: 20 },
      ]);
      expect(page).toEqual({
        data: [
          {
            id: ALERT_ID,
            status: 'OPEN',
            documents: [
              {
                id: DOC_A,
                title: 'Manual de compras',
                status: 'ACTIVE',
                versionNumber: 2,
                section: 'Aprobaciones',
                isCurrentVersion: true,
              },
              {
                id: DOC_B,
                title: 'Política de gastos',
                status: 'ACTIVE',
                versionNumber: 1,
                section: 'Sin sección',
                isCurrentVersion: true,
              },
            ],
            question: '¿Quién aprueba una compra de $800.000?',
            firstDetectedAt: '2026-11-05T13:00:00.000Z',
            lastDetectedAt: '2026-11-07T13:00:00.000Z',
            occurrences: 3,
            resolvedAt: null,
            resolvedBy: null,
            resolutionNote: null,
          },
        ],
        total: 1,
        openTotal: 1,
        page: 1,
        limit: 20,
      });
    });

    it('quien resolvió va como referencia de la spec 008, también inactivo o desconocido', async () => {
      repository.alerts = new Map([
        [
          'r1',
          alert({
            id: 'r1',
            status: 'RESOLVED',
            resolvedAt: NOW,
            resolvedById: FIXTURE_USERS.admin.id,
            resolutionNote: 'Corregida',
          }),
        ],
        [
          'r2',
          alert({
            id: 'r2',
            status: 'RESOLVED',
            resolvedAt: NOW,
            resolvedById: 'desconocido',
          }),
        ],
      ]);
      users = new InMemoryUsersDirectory([
        {
          ...FIXTURE_USERS.admin,
          name: 'Ana Administradora',
          isActive: false,
        },
      ]);

      const page = await build().list({
        status: 'RESOLVED',
        page: 1,
        limit: 20,
      });

      expect(page.data.map((a) => a.resolvedBy)).toEqual([
        {
          id: FIXTURE_USERS.admin.id,
          name: 'Ana Administradora',
          isActive: false,
        },
        { id: 'desconocido', name: null, isActive: false },
      ]);
      expect(page.data[0]).toMatchObject({
        resolvedAt: NOW.toISOString(),
        resolutionNote: 'Corregida',
      });
    });

    it('la base caída es 503', async () => {
      repository.failure = new RepositoryUnavailableError('base caída');

      await expect(
        build().list({ status: 'OPEN', page: 1, limit: 20 }),
      ).rejects.toThrow(ServiceUnavailableException);
    });
  });

  describe('resolve (R15, R16)', () => {
    it('E13: la marca como resuelta, con la nota, y lo audita', async () => {
      const resolved = await build().resolve(ALERT_ID, ADMIN, {
        note: '  Corregida la política en la v2  ',
      });

      expect(resolved).toMatchObject({
        status: 'RESOLVED',
        resolvedAt: NOW.toISOString(),
        resolvedBy: { id: ADMIN.id, isActive: true },
        resolutionNote: 'Corregida la política en la v2',
      });
      expect(audit.entries).toEqual([
        {
          action: 'CONFLICT_ALERT_RESOLVE',
          actorId: ADMIN.id,
          conflictAlertId: ALERT_ID,
          documentId: DOC_A,
          relatedDocumentId: DOC_B,
          result: 'SUCCESS',
          at: NOW,
        },
      ]);
    });

    it.each([[{}], [{ note: '   ' }]])(
      'sin nota, o con una de espacios, guarda null (%j)',
      async (dto) => {
        const resolved = await build().resolve(ALERT_ID, ADMIN, dto);

        expect(resolved.resolutionNote).toBeNull();
      },
    );

    it('E14: una ya resuelta es 409, y el fallo se audita', async () => {
      await build().resolve(ALERT_ID, ADMIN, {});

      await expect(build().resolve(ALERT_ID, ADMIN, {})).rejects.toThrow(
        new ConflictException('La alerta ya está resuelta'),
      );
      expect(audit.entries[1]).toMatchObject({
        action: 'CONFLICT_ALERT_RESOLVE',
        conflictAlertId: ALERT_ID,
        documentId: DOC_A,
        relatedDocumentId: DOC_B,
        result: 'FAILURE',
        detail: '409',
      });
    });

    it('una que no existe es 404, y el fallo se audita sin documentos', async () => {
      await expect(build().resolve('otra', ADMIN, {})).rejects.toThrow(
        new NotFoundException('No se encontró la alerta'),
      );
      expect(audit.entries).toEqual([
        {
          action: 'CONFLICT_ALERT_RESOLVE',
          actorId: ADMIN.id,
          conflictAlertId: 'otra',
          result: 'FAILURE',
          detail: '404',
          at: NOW,
        },
      ]);
    });

    it('la base caída es 503', async () => {
      repository.failure = new RepositoryUnavailableError('base caída');

      await expect(build().resolve(ALERT_ID, ADMIN, {})).rejects.toThrow(
        ServiceUnavailableException,
      );
      expect(audit.entries[0]).toMatchObject({
        result: 'FAILURE',
        detail: '503',
      });
    });
  });
});
