import {
  BadRequestException,
  ConflictException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { AuthUser } from '../common/auth';
import { StorageUnavailableError } from '../storage/file-storage';
import type { FileStorage } from '../storage/file-storage';
import { AREA_IDS, FIXTURE_USERS } from './adapters/fixtures';
import { DocumentLifecycleService } from './document-lifecycle.service';
import {
  ConcurrentVersionError,
  RepositoryUnavailableError,
} from './documents.repository';
import type {
  DocumentRecord,
  DocumentsRepository,
  NewVersion,
} from './documents.repository';
import type { AreasDirectory } from './ports/areas-directory';
import type { AuditEntry, AuditLog } from './ports/audit-log';
import { QueueUnavailableError } from './ports/processing-queue';
import type { ProcessingQueue } from './ports/processing-queue';
import type { UsersDirectory } from './ports/users-directory';

const UNKNOWN_AREA = '0a000000-0000-4000-8000-000000000099';
const DOCUMENT_ID = '0c000000-0000-4000-8000-000000000001';
const OTHER_DOCUMENT = '0c000000-0000-4000-8000-000000000002';
const UUID =
  '[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';

// 22/10/2026 a las 12:00 en Buenos Aires (UTC−3).
const NOON_IN_BUENOS_AIRES = new Date('2026-10-22T15:00:00.000Z');
const TODAY = '2026-10-22';
const TOMORROW = '2026-10-23';

// El archivo de la versión nueva y su SHA-256.
const PDF_CONTENT = Buffer.from('%PDF-1.7\nversión 2');
const NEW_CHECKSUM = createHash('sha256').update(PDF_CONTENT).digest('hex');
const pdf = (originalname = 'manual v2.pdf') => ({
  originalname,
  buffer: PDF_CONTENT,
});

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

  describe('addVersion (R6 a R9)', () => {
    beforeEach(() => {
      storage.put.mockImplementation(() => {
        events.push('put');
        return Promise.resolve();
      });
      storage.delete.mockImplementation(() => {
        events.push('delete');
        return Promise.resolve();
      });
      queue.enqueue.mockImplementation(() => {
        events.push('enqueue');
        return Promise.resolve();
      });
      // Como el real: la nueva queda CURRENT y PENDING con el número siguiente.
      repository.addVersion.mockImplementation(
        (_tx: unknown, id: string, version: NewVersion, reviewDate?: Date) => {
          events.push('addVersion');
          return Promise.resolve(
            documentRecord({
              id,
              ...(reviewDate && { reviewDate }),
              currentVersion: {
                ...version,
                versionNumber: 2,
                status: 'CURRENT',
                processingStatus: 'PENDING',
                createdAt: new Date(),
              },
            }),
          );
        },
      );
    });

    const newVersion = () =>
      repository.addVersion.mock.calls[0][2] as NewVersion;
    const oldKey = documentRecord().currentVersion.storageKey;
    const conflictBody = async (upload: Promise<unknown>) => {
      const error = (await upload.catch((caught: unknown) => caught)) as
        ConflictException | undefined;
      expect(error).toBeInstanceOf(ConflictException);
      return (error as ConflictException).getResponse();
    };
    const expectNewFileDeleted = () => {
      expect(storage.delete).toHaveBeenCalledTimes(1);
      expect(storage.delete).toHaveBeenCalledWith(newVersion().storageKey);
      // D6: el archivo de la versión anterior nunca se borra.
      expect(storage.delete).not.toHaveBeenCalledWith(oldKey);
    };

    it('valida, sube, bloquea, reemplaza, audita y encola al final de la transacción', async () => {
      const result = await service.addVersion(DOCUMENT_ID, pdf(), {}, admin);

      expect(events).toEqual([
        'read',
        'put',
        'begin',
        'lock',
        'addVersion',
        'audit:SUCCESS',
        'enqueue',
        'commit',
      ]);
      expect(result.currentVersion).toMatchObject({
        versionNumber: 2,
        status: 'CURRENT',
        processingStatus: 'PENDING',
      });
    });

    it('arma la versión nueva con su clave y encola su id', async () => {
      await service.addVersion(
        DOCUMENT_ID,
        pdf(`${'a'.repeat(300)}.pdf`),
        {},
        admin,
      );

      const version = newVersion();
      expect(version).toEqual({
        id: expect.stringMatching(new RegExp(`^${UUID}$`)) as string,
        storageKey: `documents/${DOCUMENT_ID}/${version.id}.pdf`,
        originalFileName: 'a'.repeat(255),
        mimeType: 'application/pdf',
        sizeBytes: PDF_CONTENT.length,
        checksum: NEW_CHECKSUM,
        uploadedById: admin.id,
      });
      expect(storage.put).toHaveBeenCalledWith(
        version.storageKey,
        PDF_CONTENT,
        'application/pdf',
        NEW_CHECKSUM,
      );
      expect(queue.enqueue).toHaveBeenCalledWith(version.id);
      expect(storage.delete).not.toHaveBeenCalled();
    });

    it('audita SUCCESS en la transacción, con el documento (R13)', async () => {
      await service.addVersion(DOCUMENT_ID, pdf(), {}, admin);

      expect(audit.record).toHaveBeenCalledTimes(1);
      expect(audit.record).toHaveBeenCalledWith(
        {
          action: 'DOCUMENT_VERSION_UPLOAD',
          actorId: admin.id,
          documentId: DOCUMENT_ID,
          result: 'SUCCESS',
          at: expect.any(Date) as Date,
        },
        TX,
      );
    });

    describe('antes de subir el archivo', () => {
      it('sin archivo → 400 y no lee el documento', async () => {
        await expect(
          service.addVersion(DOCUMENT_ID, undefined, {}, admin),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(repository.findByIdWithAreas).not.toHaveBeenCalled();
        expect(storage.put).not.toHaveBeenCalled();
      });

      it('extensión falsa → 415', async () => {
        const fake = { originalname: 'manual.pdf', buffer: Buffer.from('PK') };

        await expect(
          service.addVersion(DOCUMENT_ID, fake, {}, admin),
        ).rejects.toBeInstanceOf(UnsupportedMediaTypeException);
        expect(storage.put).not.toHaveBeenCalled();
      });

      it('404 si el documento no existe', async () => {
        repository.findByIdWithAreas.mockResolvedValue(null);

        await expect(
          service.addVersion(DOCUMENT_ID, pdf(), {}, admin),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(storage.put).not.toHaveBeenCalled();
        expect(failureAudit()?.[0]).not.toHaveProperty('documentId');
      });

      it('409 ARCHIVED si está archivado (R11)', async () => {
        repository.findByIdWithAreas.mockResolvedValue(
          documentRecord({ status: 'ARCHIVED' }),
        );

        const body = await conflictBody(
          service.addVersion(DOCUMENT_ID, pdf(), {}, admin),
        );

        expect(body).toMatchObject({ reason: 'ARCHIVED' });
        expect(storage.put).not.toHaveBeenCalled();
      });

      it('E3: idéntico a la vigente → 409 IDENTICAL_TO_CURRENT, sin put y auditado con el documento (R6b)', async () => {
        repository.findActiveByChecksum.mockResolvedValue({
          documentId: DOCUMENT_ID,
        });

        const body = await conflictBody(
          service.addVersion(DOCUMENT_ID, pdf(), {}, admin),
        );

        expect(body).toMatchObject({
          statusCode: 409,
          message: 'El archivo es igual a la versión vigente',
          reason: 'IDENTICAL_TO_CURRENT',
        });
        expect(repository.findActiveByChecksum).toHaveBeenCalledWith(
          NEW_CHECKSUM,
        );
        expect(storage.put).not.toHaveBeenCalled();
        expect(failureAudit()?.[0]).toEqual({
          action: 'DOCUMENT_VERSION_UPLOAD',
          actorId: admin.id,
          documentId: DOCUMENT_ID,
          result: 'FAILURE',
          detail: '409',
          at: expect.any(Date) as Date,
        });
      });

      it('idéntico a la vigente de otro documento → 409 DUPLICATE con existingDocumentId (R8b de la spec 001)', async () => {
        repository.findActiveByChecksum.mockResolvedValue({
          documentId: OTHER_DOCUMENT,
        });

        const body = await conflictBody(
          service.addVersion(DOCUMENT_ID, pdf(), {}, admin),
        );

        expect(body).toMatchObject({
          reason: 'DUPLICATE',
          existingDocumentId: OTHER_DOCUMENT,
        });
        expect(storage.put).not.toHaveBeenCalled();
      });
    });

    describe('E4: fecha de revisión (R7b)', () => {
      it('una fecha futura se pasa al repositorio', async () => {
        await service.addVersion(
          DOCUMENT_ID,
          pdf(),
          { reviewDate: TOMORROW },
          admin,
        );

        expect(repository.addVersion.mock.calls[0][3]).toEqual(
          new Date(`${TOMORROW}T00:00:00.000Z`),
        );
      });

      it('si no viene, no se pasa', async () => {
        await service.addVersion(DOCUMENT_ID, pdf(), {}, admin);

        expect(repository.addVersion.mock.calls[0][3]).toBeUndefined();
      });

      it('la de hoy → 400 sin subir nada', async () => {
        const upload = service.addVersion(
          DOCUMENT_ID,
          pdf(),
          { reviewDate: TODAY },
          admin,
        );

        await expect(upload).rejects.toBeInstanceOf(BadRequestException);
        await expect(upload).rejects.toThrow(/^reviewDate/);
        expect(storage.put).not.toHaveBeenCalled();
      });
    });

    describe('fallas después de subir el archivo (R9)', () => {
      it('E5: falla la cola → 503, rollback y se borra solo el archivo nuevo', async () => {
        queue.enqueue.mockRejectedValue(new QueueUnavailableError('caída'));

        const upload = service.addVersion(DOCUMENT_ID, pdf(), {}, admin);

        await expect(upload).rejects.toBeInstanceOf(
          ServiceUnavailableException,
        );
        await expect(upload).rejects.toThrow(
          'No se pudo completar la carga de la versión nueva. Intentá de nuevo más tarde.',
        );
        expect(events.slice(-3)).toEqual([
          'rollback',
          'delete',
          'audit:FAILURE',
        ]);
        expectNewFileDeleted();
        expect(failureAudit()?.[0]).toMatchObject({
          documentId: DOCUMENT_ID,
          detail: '503',
        });
      });

      it('falla el almacenamiento → 503 sin abrir la transacción', async () => {
        storage.put.mockRejectedValue(new StorageUnavailableError('caído'));

        await expect(
          service.addVersion(DOCUMENT_ID, pdf(), {}, admin),
        ).rejects.toBeInstanceOf(ServiceUnavailableException);
        expect(repository.runInTransaction).not.toHaveBeenCalled();
      });

      it('archivado bajo el bloqueo → 409 ARCHIVED y delete', async () => {
        repository.lockForUpdate.mockResolvedValue(
          documentRecord({ status: 'ARCHIVED' }),
        );

        const body = await conflictBody(
          service.addVersion(DOCUMENT_ID, pdf(), {}, admin),
        );

        expect(body).toMatchObject({ reason: 'ARCHIVED' });
        expect(repository.addVersion).not.toHaveBeenCalled();
        expect(storage.delete).toHaveBeenCalledTimes(1);
        expect(storage.delete).not.toHaveBeenCalledWith(oldKey);
      });

      it('la vigente ya tiene ese archivo bajo el bloqueo → 409 IDENTICAL_TO_CURRENT y delete (R6b)', async () => {
        const locked = documentRecord();
        locked.currentVersion.checksum = NEW_CHECKSUM;
        repository.lockForUpdate.mockResolvedValue(locked);

        const body = await conflictBody(
          service.addVersion(DOCUMENT_ID, pdf(), {}, admin),
        );

        expect(body).toMatchObject({ reason: 'IDENTICAL_TO_CURRENT' });
        expect(repository.addVersion).not.toHaveBeenCalled();
        expect(storage.delete).toHaveBeenCalledTimes(1);
      });

      it('ConcurrentVersionError → 409 CONCURRENT_VERSION y delete (R8)', async () => {
        repository.addVersion.mockImplementation(
          (_tx: unknown, _id: string, version: NewVersion) => {
            events.push(`addVersion:${version.id}`);
            return Promise.reject(
              new ConcurrentVersionError('otra CURRENT confirmada'),
            );
          },
        );

        const body = await conflictBody(
          service.addVersion(DOCUMENT_ID, pdf(), {}, admin),
        );

        expect(body).toMatchObject({
          statusCode: 409,
          reason: 'CONCURRENT_VERSION',
        });
        expectNewFileDeleted();
        expect(failureAudit()?.[0]).toMatchObject({
          documentId: DOCUMENT_ID,
          detail: '409',
        });
      });
    });
  });

  describe('archive (R10, R11)', () => {
    const ARCHIVED_AT = new Date('2026-10-22T15:00:00.000Z');

    beforeEach(() => {
      repository.archive.mockImplementation(
        (_tx: unknown, id: string, at: Date) => {
          events.push('archive');
          return Promise.resolve(
            documentRecord({ id, status: 'ARCHIVED', archivedAt: at }),
          );
        },
      );
    });

    it('lee, bloquea, archiva con la fecha de ahora y audita, en ese orden', async () => {
      const result = await service.archive(DOCUMENT_ID, admin);

      expect(events).toEqual([
        'read',
        'begin',
        'lock',
        'archive',
        'audit:SUCCESS',
        'commit',
      ]);
      expect(repository.archive).toHaveBeenCalledWith(
        TX,
        DOCUMENT_ID,
        ARCHIVED_AT,
      );
      expect(result).toMatchObject({
        status: 'ARCHIVED',
        archivedAt: ARCHIVED_AT.toISOString(),
      });
    });

    it('audita DOCUMENT_ARCHIVE con SUCCESS en la transacción (R13)', async () => {
      await service.archive(DOCUMENT_ID, admin);

      expect(audit.record).toHaveBeenCalledTimes(1);
      expect(audit.record).toHaveBeenCalledWith(
        {
          action: 'DOCUMENT_ARCHIVE',
          actorId: admin.id,
          documentId: DOCUMENT_ID,
          result: 'SUCCESS',
          at: expect.any(Date) as Date,
        },
        TX,
      );
    });

    it('404 si no existe, sin abrir la transacción', async () => {
      repository.findByIdWithAreas.mockResolvedValue(null);

      await expect(service.archive(DOCUMENT_ID, admin)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(repository.runInTransaction).not.toHaveBeenCalled();
      expect(failureAudit()?.[0]).toMatchObject({
        action: 'DOCUMENT_ARCHIVE',
        detail: '404',
      });
    });

    it('409 ARCHIVED si ya está archivado, y FAILURE con el documento', async () => {
      repository.findByIdWithAreas.mockResolvedValue(
        documentRecord({ status: 'ARCHIVED', archivedAt: ARCHIVED_AT }),
      );

      const archive = service.archive(DOCUMENT_ID, admin);

      await expect(archive).rejects.toBeInstanceOf(ConflictException);
      await archive.catch((error: ConflictException) =>
        expect(error.getResponse()).toMatchObject({ reason: 'ARCHIVED' }),
      );
      expect(repository.runInTransaction).not.toHaveBeenCalled();
      expect(failureAudit()?.[0]).toEqual({
        action: 'DOCUMENT_ARCHIVE',
        actorId: admin.id,
        documentId: DOCUMENT_ID,
        result: 'FAILURE',
        detail: '409',
        at: expect.any(Date) as Date,
      });
    });

    it('409 si se archivó entre la lectura y el bloqueo: rollback sin archivar otra vez', async () => {
      repository.lockForUpdate.mockResolvedValue(
        documentRecord({ status: 'ARCHIVED', archivedAt: ARCHIVED_AT }),
      );

      await expect(service.archive(DOCUMENT_ID, admin)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(repository.archive).not.toHaveBeenCalled();
      expect(events).toContain('rollback');
    });

    it('si la base no responde → 503 y FAILURE con el código y el documento', async () => {
      repository.archive.mockRejectedValue(
        new RepositoryUnavailableError('timeout'),
      );

      const archive = service.archive(DOCUMENT_ID, admin);

      await expect(archive).rejects.toBeInstanceOf(ServiceUnavailableException);
      await expect(archive).rejects.toThrow(
        'No se pudo completar el archivado del documento. Intentá de nuevo más tarde.',
      );
      expect(failureAudit()?.[0]).toMatchObject({
        action: 'DOCUMENT_ARCHIVE',
        documentId: DOCUMENT_ID,
        detail: '503',
      });
    });
  });
});
