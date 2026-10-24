import {
  BadRequestException,
  ConflictException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { AuthUser } from '../common/auth';
import type { FileStorage } from '../storage/file-storage';
import { AREA_IDS, FIXTURE_USERS } from './adapters/fixtures';
import { DocumentLifecycleService } from './document-lifecycle.service';
import { RepositoryUnavailableError } from './documents.repository';
import type {
  DocumentRecord,
  DocumentsRepository,
} from './documents.repository';
import type { AreasDirectory } from './ports/areas-directory';
import type { AuditEntry, AuditLog } from './ports/audit-log';
import type { ProcessingQueue } from './ports/processing-queue';
import type { UsersDirectory } from './ports/users-directory';

const UNKNOWN_AREA = '0a000000-0000-4000-8000-000000000099';
const DOCUMENT_ID = '0c000000-0000-4000-8000-000000000001';

// 22/10/2026 a las 12:00 en Buenos Aires (UTC−3).
const NOON_IN_BUENOS_AIRES = new Date('2026-10-22T15:00:00.000Z');

// La transacción que entrega el repositorio simulado: el servicio solo la pasa.
const TX = { transaction: 'simulada' };

const admin: AuthUser = { id: FIXTURE_USERS.admin.id, role: 'ADMIN' };

// Un documento de Ventas. Su responsable es el ADMIN, que puede serlo de cualquier área (R4).
const documentRecord = (
  overrides: Partial<DocumentRecord> = {},
): DocumentRecord => ({
  id: DOCUMENT_ID,
  title: 'Manual de caja',
  description: null,
  status: 'ACTIVE',
  areaIds: [AREA_IDS.ventas],
  ownerId: FIXTURE_USERS.admin.id,
  reviewDate: new Date('2027-01-15T00:00:00.000Z'),
  createdById: FIXTURE_USERS.admin.id,
  createdAt: new Date('2026-10-01T12:00:00.000Z'),
  archivedAt: null,
  currentVersion: {
    id: '0d000000-0000-4000-8000-000000000001',
    versionNumber: 1,
    status: 'CURRENT',
    storageKey: `documents/${DOCUMENT_ID}/v1.pdf`,
    originalFileName: 'manual.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 1024,
    checksum: 'a'.repeat(64),
    processingStatus: 'READY',
    createdAt: new Date('2026-10-01T12:00:00.000Z'),
  },
  ...overrides,
});

describe('DocumentLifecycleService', () => {
  let events: string[];
  let areas: { findExistingIds: jest.Mock };
  let users: { findById: jest.Mock };
  let repository: {
    runInTransaction: jest.Mock;
    findByIdWithAreas: jest.Mock;
    findActiveByChecksum: jest.Mock;
    lockForUpdate: jest.Mock;
    replaceAreas: jest.Mock;
    addVersion: jest.Mock;
    archive: jest.Mock;
  };
  let storage: { put: jest.Mock; delete: jest.Mock };
  let queue: { enqueue: jest.Mock };
  let audit: { record: jest.Mock };
  let loggerError: jest.SpyInstance;
  let service: DocumentLifecycleService;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(NOON_IN_BUENOS_AIRES);
    loggerError = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    events = [];

    areas = {
      findExistingIds: jest.fn((ids: string[]) =>
        Promise.resolve(ids.filter((id) => id !== UNKNOWN_AREA)),
      ),
    };
    const fixtureUsers = Object.values(FIXTURE_USERS);
    users = {
      findById: jest.fn((id: string) =>
        Promise.resolve(fixtureUsers.find((user) => user.id === id) ?? null),
      ),
    };
    repository = {
      // Como la real: si fn lanza, rollback; si no, commit.
      runInTransaction: jest.fn(
        async (fn: (tx: unknown) => Promise<unknown>) => {
          events.push('begin');
          try {
            const result = await fn(TX);
            events.push('commit');
            return result;
          } catch (error) {
            events.push('rollback');
            throw error;
          }
        },
      ),
      findByIdWithAreas: jest.fn(() => {
        events.push('read');
        return Promise.resolve(documentRecord());
      }),
      findActiveByChecksum: jest.fn().mockResolvedValue(null),
      lockForUpdate: jest.fn(() => {
        events.push('lock');
        return Promise.resolve(documentRecord());
      }),
      replaceAreas: jest.fn(
        (_tx: unknown, id: string, areaIds: string[], ownerId?: string) => {
          events.push('replaceAreas');
          return Promise.resolve(
            documentRecord({
              id,
              areaIds,
              ...(ownerId && { ownerId }),
            }),
          );
        },
      ),
      addVersion: jest.fn(),
      archive: jest.fn(),
    };
    storage = {
      put: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    queue = { enqueue: jest.fn().mockResolvedValue(undefined) };
    audit = {
      record: jest.fn((entry: AuditEntry) => {
        events.push(`audit:${entry.result}`);
        return Promise.resolve();
      }),
    };

    service = new DocumentLifecycleService(
      areas as unknown as AreasDirectory,
      users as unknown as UsersDirectory,
      repository as unknown as DocumentsRepository,
      storage as unknown as FileStorage,
      queue as unknown as ProcessingQueue,
      audit as unknown as AuditLog,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
    loggerError.mockRestore();
  });

  const failureAudit = () =>
    audit.record.mock.calls.find(
      ([entry]) => (entry as AuditEntry).result === 'FAILURE',
    ) as [AuditEntry, unknown?] | undefined;

  describe('changeAreas (R3, R4, R5)', () => {
    const toOperaciones = { areaIds: [AREA_IDS.operaciones] };

    it('lee, valida, bloquea, reemplaza y audita, en ese orden', async () => {
      const result = await service.changeAreas(DOCUMENT_ID, toOperaciones, {
        ...admin,
      });

      expect(events).toEqual([
        'read',
        'begin',
        'lock',
        'replaceAreas',
        'audit:SUCCESS',
        'commit',
      ]);
      expect(repository.replaceAreas).toHaveBeenCalledWith(
        TX,
        DOCUMENT_ID,
        [AREA_IDS.operaciones],
        undefined,
      );
      expect(result).toMatchObject({
        id: DOCUMENT_ID,
        areaIds: [AREA_IDS.operaciones],
      });
    });

    it('audita SUCCESS dentro de la transacción, con el documento (R13)', async () => {
      await service.changeAreas(DOCUMENT_ID, toOperaciones, admin);

      expect(audit.record).toHaveBeenCalledTimes(1);
      expect(audit.record).toHaveBeenCalledWith(
        {
          action: 'DOCUMENT_AREAS_CHANGE',
          actorId: admin.id,
          documentId: DOCUMENT_ID,
          result: 'SUCCESS',
          at: expect.any(Date) as Date,
        },
        TX,
      );
    });

    it('404 si el documento no existe, sin abrir la transacción', async () => {
      repository.findByIdWithAreas.mockResolvedValue(null);

      const change = service.changeAreas(DOCUMENT_ID, toOperaciones, admin);

      await expect(change).rejects.toBeInstanceOf(NotFoundException);
      await expect(change).rejects.toThrow('No se encontró el documento');
      expect(repository.runInTransaction).not.toHaveBeenCalled();
      expect(failureAudit()?.[0]).toMatchObject({
        action: 'DOCUMENT_AREAS_CHANGE',
        detail: '404',
      });
      expect(failureAudit()?.[0]).not.toHaveProperty('documentId');
    });

    describe('409 ARCHIVED (R11)', () => {
      it('si ya estaba archivado: no abre la transacción y audita la falla con el documento', async () => {
        repository.findByIdWithAreas.mockResolvedValue(
          documentRecord({ status: 'ARCHIVED' }),
        );

        const change = service.changeAreas(DOCUMENT_ID, toOperaciones, admin);

        await expect(change).rejects.toBeInstanceOf(ConflictException);
        await change.catch((error: ConflictException) =>
          expect(error.getResponse()).toMatchObject({
            statusCode: 409,
            reason: 'ARCHIVED',
          }),
        );
        expect(repository.runInTransaction).not.toHaveBeenCalled();
        expect(failureAudit()?.[0]).toEqual({
          action: 'DOCUMENT_AREAS_CHANGE',
          actorId: admin.id,
          documentId: DOCUMENT_ID,
          result: 'FAILURE',
          detail: '409',
          at: expect.any(Date) as Date,
        });
      });

      it('si se archivó entre la lectura y el bloqueo: rollback sin reemplazar', async () => {
        repository.lockForUpdate.mockResolvedValue(
          documentRecord({ status: 'ARCHIVED' }),
        );

        const change = service.changeAreas(DOCUMENT_ID, toOperaciones, admin);

        await expect(change).rejects.toBeInstanceOf(ConflictException);
        expect(repository.replaceAreas).not.toHaveBeenCalled();
        expect(events).toContain('rollback');
        expect(failureAudit()?.[0]).toMatchObject({
          documentId: DOCUMENT_ID,
          detail: '409',
        });
      });
    });

    it('400 si un área no existe (R3), sin abrir la transacción', async () => {
      const change = service.changeAreas(
        DOCUMENT_ID,
        { areaIds: [AREA_IDS.ventas, UNKNOWN_AREA] },
        admin,
      );

      await expect(change).rejects.toBeInstanceOf(BadRequestException);
      await expect(change).rejects.toThrow(/^areaIds: /);
      expect(repository.runInTransaction).not.toHaveBeenCalled();
    });

    it('E6: el responsable actual pierde el acceso → 400 ownerId y no se abre la transacción', async () => {
      repository.findByIdWithAreas.mockResolvedValue(
        documentRecord({ ownerId: FIXTURE_USERS.supervisorVentas.id }),
      );

      const change = service.changeAreas(DOCUMENT_ID, toOperaciones, admin);

      await expect(change).rejects.toBeInstanceOf(BadRequestException);
      await expect(change).rejects.toThrow(/^ownerId: /);
      expect(repository.runInTransaction).not.toHaveBeenCalled();
      expect(failureAudit()?.[0]).toMatchObject({
        documentId: DOCUMENT_ID,
        detail: '400',
      });
    });

    it('con un ownerId nuevo con acceso a las áreas nuevas: pasa y llega al repositorio (P2)', async () => {
      const ownerId = FIXTURE_USERS.supervisorOperaciones.id;

      const result = await service.changeAreas(
        DOCUMENT_ID,
        { ...toOperaciones, ownerId },
        admin,
      );

      expect(repository.replaceAreas).toHaveBeenCalledWith(
        TX,
        DOCUMENT_ID,
        [AREA_IDS.operaciones],
        ownerId,
      );
      expect(result.ownerId).toBe(ownerId);
    });

    it('con un ownerId nuevo sin acceso a las áreas nuevas → 400 ownerId', async () => {
      const change = service.changeAreas(
        DOCUMENT_ID,
        { ...toOperaciones, ownerId: FIXTURE_USERS.empleadoVentas.id },
        admin,
      );

      await expect(change).rejects.toThrow(/^ownerId: /);
      expect(repository.runInTransaction).not.toHaveBeenCalled();
    });

    describe('D4: sin cambios', () => {
      it('las mismas áreas, en otro orden: devuelve el documento sin escribir ni auditar', async () => {
        repository.findByIdWithAreas.mockResolvedValue(
          documentRecord({ areaIds: [AREA_IDS.ventas, AREA_IDS.operaciones] }),
        );

        const result = await service.changeAreas(
          DOCUMENT_ID,
          { areaIds: [AREA_IDS.operaciones, AREA_IDS.ventas] },
          admin,
        );

        expect(result.id).toBe(DOCUMENT_ID);
        expect(repository.runInTransaction).not.toHaveBeenCalled();
        expect(repository.replaceAreas).not.toHaveBeenCalled();
        expect(audit.record).not.toHaveBeenCalled();
      });

      it('las mismas áreas y el mismo responsable: tampoco escribe', async () => {
        await service.changeAreas(
          DOCUMENT_ID,
          { areaIds: [AREA_IDS.ventas], ownerId: FIXTURE_USERS.admin.id },
          admin,
        );

        expect(repository.replaceAreas).not.toHaveBeenCalled();
        expect(audit.record).not.toHaveBeenCalled();
      });

      it('las mismas áreas con otro responsable: sí es un cambio', async () => {
        await service.changeAreas(
          DOCUMENT_ID,
          {
            areaIds: [AREA_IDS.ventas],
            ownerId: FIXTURE_USERS.supervisorVentas.id,
          },
          admin,
        );

        expect(repository.replaceAreas).toHaveBeenCalledTimes(1);
      });
    });

    it('si la base no responde → 503 y auditoría FAILURE con el documento', async () => {
      repository.replaceAreas.mockRejectedValue(
        new RepositoryUnavailableError('timeout'),
      );
      const change = service.changeAreas(DOCUMENT_ID, toOperaciones, admin);

      await expect(change).rejects.toBeInstanceOf(ServiceUnavailableException);
      await expect(change).rejects.toThrow(
        'No se pudo completar el cambio de áreas. Intentá de nuevo más tarde.',
      );
      expect(events).toContain('rollback');
      expect(failureAudit()?.[0]).toMatchObject({
        action: 'DOCUMENT_AREAS_CHANGE',
        documentId: DOCUMENT_ID,
        detail: '503',
      });
    });
  });
});
