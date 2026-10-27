import {
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import type { AuthUser } from '../common/auth';
import { StorageUnavailableError } from '../storage/file-storage';
import type { FileStorage } from '../storage/file-storage';
import { AREA_IDS, FIXTURE_USERS } from './adapters/fixtures';
import { DocumentUploadService } from './document-upload.service';
import { RepositoryUnavailableError } from './documents.repository';
import type {
  DocumentRecord,
  DocumentsRepository,
  NewDocument,
} from './documents.repository';
import type { CreateDocumentDto } from './dto/create-document.dto';
import type { AreasDirectory } from './ports/areas-directory';
import type { AuditEntry, AuditLog } from './ports/audit-log';
import {
  ProcessingQueue,
  QueueUnavailableError,
} from './ports/processing-queue';
import type { UsersDirectory } from './ports/users-directory';

const UNKNOWN_AREA = '0a000000-0000-4000-8000-000000000099';
const EXISTING_DOCUMENT = '0c000000-0000-4000-8000-000000000001';
const UUID =
  '[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';

// 22/10/2026 a las 12:00 en Buenos Aires (UTC−3).
const NOON_IN_BUENOS_AIRES = new Date('2026-10-22T15:00:00.000Z');
const TODAY = '2026-10-22';
const YESTERDAY = '2026-10-21';
const TOMORROW = '2026-10-23';

// La transacción que entrega el repositorio simulado: los servicios solo la pasan.
const TX = { transaction: 'simulada' };

const admin: AuthUser = {
  id: FIXTURE_USERS.admin.id,
  email: 'admin@empresa.com',
  name: 'Admin',
  role: 'ADMIN',
  areaIds: [...FIXTURE_USERS.admin.areaIds],
};
const PDF_CONTENT = Buffer.from('%PDF-1.7\ncontenido');
const pdf = (originalname = 'manual.pdf') => ({
  originalname,
  buffer: PDF_CONTENT,
});
const dto = (
  overrides: Partial<CreateDocumentDto> = {},
): CreateDocumentDto => ({
  title: 'Manual de caja',
  areaIds: [AREA_IDS.ventas],
  ownerId: FIXTURE_USERS.supervisorVentas.id,
  reviewDate: TOMORROW,
  ...overrides,
});

// Lo que devolvería el repositorio real: fija ACTIVE, versión 1, CURRENT y PENDING (T11).
const recordFrom = (data: NewDocument): DocumentRecord => ({
  id: data.id,
  title: data.title,
  description: data.description,
  status: 'ACTIVE',
  areaIds: data.areaIds,
  ownerId: data.ownerId,
  reviewDate: data.reviewDate,
  createdById: data.createdById,
  createdAt: new Date(),
  currentVersion: {
    ...data.version,
    versionNumber: 1,
    status: 'CURRENT',
    processingStatus: 'PENDING',
    createdAt: new Date(),
  },
});

describe('DocumentUploadService', () => {
  let events: string[];
  let areas: { findExistingIds: jest.Mock };
  let users: { findById: jest.Mock };
  let repository: {
    findActiveByChecksum: jest.Mock;
    runInTransaction: jest.Mock;
    createWithFirstVersion: jest.Mock;
    list: jest.Mock;
    findByIdWithAreas: jest.Mock;
  };
  let storage: { put: jest.Mock; delete: jest.Mock; getDownloadUrl: jest.Mock };
  let queue: { enqueue: jest.Mock };
  let audit: { record: jest.Mock };
  let loggerError: jest.SpyInstance;
  let service: DocumentUploadService;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(NOON_IN_BUENOS_AIRES);
    loggerError = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => {});
    events = [];

    areas = {
      findExistingIds: jest.fn((ids: string[]) =>
        Promise.resolve(
          ids.filter((id) => Object.values<string>(AREA_IDS).includes(id)),
        ),
      ),
    };
    users = {
      findById: jest.fn((id: string) =>
        Promise.resolve(
          Object.values(FIXTURE_USERS).find((user) => user.id === id) ?? null,
        ),
      ),
    };
    repository = {
      findActiveByChecksum: jest.fn().mockResolvedValue(null),
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
      createWithFirstVersion: jest.fn((_tx: unknown, data: NewDocument) => {
        events.push('create');
        return Promise.resolve(recordFrom(data));
      }),
      list: jest.fn(),
      findByIdWithAreas: jest.fn(),
    };
    storage = {
      put: jest.fn(() => {
        events.push('put');
        return Promise.resolve();
      }),
      delete: jest.fn(() => {
        events.push('delete');
        return Promise.resolve();
      }),
      getDownloadUrl: jest.fn(),
    };
    queue = {
      enqueue: jest.fn(() => {
        events.push('enqueue');
        return Promise.resolve();
      }),
    };
    audit = {
      record: jest.fn((entry: AuditEntry) => {
        events.push(`audit:${entry.result}`);
        return Promise.resolve();
      }),
    };

    service = new DocumentUploadService(
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

  const expectNothingWritten = () => {
    expect(storage.put).not.toHaveBeenCalled();
    expect(repository.runInTransaction).not.toHaveBeenCalled();
  };
  const expectAccepted = (upload: Promise<unknown>) =>
    expect(upload).resolves.toHaveProperty('id');
  const createdData = () =>
    repository.createWithFirstVersion.mock.calls[0][1] as NewDocument;
  const failureAudit = () =>
    audit.record.mock.calls.find(
      ([entry]) => (entry as AuditEntry).result === 'FAILURE',
    ) as [AuditEntry, unknown?] | undefined;

  describe('validaciones previas a escribir (T14)', () => {
    it('una carga válida pasa las validaciones', async () => {
      await expectAccepted(service.upload(pdf(), dto(), admin));
    });

    describe('archivo (3b)', () => {
      it('extensión falsa: 415 y no consulta nada más', async () => {
        const fake = {
          originalname: 'manual.pdf',
          buffer: Buffer.from('hola'),
        };

        await expect(service.upload(fake, dto(), admin)).rejects.toThrow(
          UnsupportedMediaTypeException,
        );
        expect(areas.findExistingIds).not.toHaveBeenCalled();
        expect(repository.findActiveByChecksum).not.toHaveBeenCalled();
        expectNothingWritten();
      });

      it('sin archivo: 400', async () => {
        await expect(service.upload(undefined, dto(), admin)).rejects.toThrow(
          BadRequestException,
        );
        expectNothingWritten();
      });

      it('un nombre original con rutas no afecta: se acepta', async () => {
        await expectAccepted(
          service.upload(pdf('../../manual.pdf'), dto(), admin),
        );
      });
    });

    describe('fecha de revisión (3c)', () => {
      it('de hoy: 400', async () => {
        await expect(
          service.upload(pdf(), dto({ reviewDate: TODAY }), admin),
        ).rejects.toThrow(BadRequestException);
        expectNothingWritten();
      });

      it('de ayer: 400', async () => {
        await expect(
          service.upload(pdf(), dto({ reviewDate: YESTERDAY }), admin),
        ).rejects.toThrow(BadRequestException);
        expectNothingWritten();
      });

      it('de mañana: pasa', async () => {
        await expectAccepted(
          service.upload(pdf(), dto({ reviewDate: TOMORROW }), admin),
        );
      });

      it('a las 23:30 de Buenos Aires, "mañana" se calcula en Buenos Aires', async () => {
        // 22/10 a las 23:30 en Buenos Aires = 23/10 a las 02:30 en UTC.
        jest.setSystemTime(new Date('2026-10-23T02:30:00.000Z'));

        await expectAccepted(
          service.upload(pdf(), dto({ reviewDate: '2026-10-23' }), admin),
        );
        await expect(
          service.upload(pdf(), dto({ reviewDate: '2026-10-22' }), admin),
        ).rejects.toThrow(BadRequestException);
      });
    });

    describe('áreas y responsable (3d y 3e)', () => {
      it('área inexistente: 400 que nombra el área', async () => {
        const upload = service.upload(
          pdf(),
          dto({ areaIds: [AREA_IDS.ventas, UNKNOWN_AREA] }),
          admin,
        );

        await expect(upload).rejects.toThrow(BadRequestException);
        await expect(upload).rejects.toThrow(UNKNOWN_AREA);
        expectNothingWritten();
      });

      it('responsable sin acceso: 400', async () => {
        const upload = service.upload(
          pdf(),
          dto({ ownerId: FIXTURE_USERS.empleadoOperaciones.id }),
          admin,
        );

        await expect(upload).rejects.toThrow(BadRequestException);
        await expect(upload).rejects.toThrow(/ownerId/);
        expectNothingWritten();
      });

      it('responsable inexistente: 400', async () => {
        const upload = service.upload(
          pdf(),
          dto({ ownerId: '0b000000-0000-4000-8000-000000000099' }),
          admin,
        );

        await expect(upload).rejects.toThrow(BadRequestException);
        await expect(upload).rejects.toThrow(/ownerId/);
        expectNothingWritten();
      });

      it('un área a la que el ADMIN que carga no pertenece: se permite', async () => {
        await expectAccepted(
          service.upload(
            pdf(),
            dto({
              areaIds: [AREA_IDS.operaciones],
              ownerId: FIXTURE_USERS.supervisorOperaciones.id,
            }),
            admin,
          ),
        );
      });
    });

    describe('duplicados (3f)', () => {
      it('duplicado: 409 con existingDocumentId', async () => {
        repository.findActiveByChecksum.mockResolvedValue({
          documentId: EXISTING_DOCUMENT,
        });

        const error = await service
          .upload(pdf(), dto(), admin)
          .catch((e: unknown) => e);

        expect(error).toBeInstanceOf(ConflictException);
        expect((error as ConflictException).getResponse()).toMatchObject({
          statusCode: 409,
          error: 'Conflict',
          existingDocumentId: EXISTING_DOCUMENT,
        });
        expect(repository.findActiveByChecksum).toHaveBeenCalledWith(
          expect.stringMatching(/^[0-9a-f]{64}$/),
        );
        expectNothingWritten();
      });
    });
  });

  describe('escritura todo o nada y auditoría (T15)', () => {
    it('carga correcta: put → transacción → alta → auditoría SUCCESS → encolado → commit', async () => {
      const response = await service.upload(pdf('MANUAL.PDF'), dto(), admin);

      // El orden, y que el alta, la auditoría y el encolado ocurren dentro de la transacción.
      expect(events).toEqual([
        'put',
        'begin',
        'create',
        'audit:SUCCESS',
        'enqueue',
        'commit',
      ]);

      const data = createdData();
      const key = data.version.storageKey;
      // Clave generada por el sistema: ids nuevos y la extensión detectada, sin el nombre original.
      expect(key).toMatch(
        new RegExp(`^documents/${data.id}/${data.version.id}\\.pdf$`),
      );
      expect(data.id).toMatch(new RegExp(`^${UUID}$`));
      expect(data.version.id).toMatch(new RegExp(`^${UUID}$`));
      expect(key).not.toMatch(/MANUAL/);

      expect(storage.put).toHaveBeenCalledWith(
        key,
        PDF_CONTENT,
        'application/pdf',
        data.version.checksum,
      );
      expect(repository.createWithFirstVersion).toHaveBeenCalledWith(TX, {
        id: data.id,
        title: 'Manual de caja',
        description: null,
        areaIds: [AREA_IDS.ventas],
        ownerId: FIXTURE_USERS.supervisorVentas.id,
        reviewDate: new Date('2026-10-23T00:00:00.000Z'),
        createdById: admin.id,
        version: {
          id: data.version.id,
          storageKey: key,
          originalFileName: 'MANUAL.PDF',
          mimeType: 'application/pdf',
          sizeBytes: PDF_CONTENT.length,
          checksum: expect.stringMatching(/^[0-9a-f]{64}$/) as string,
          uploadedById: admin.id,
        },
      });
      expect(audit.record).toHaveBeenCalledWith(
        {
          action: 'DOCUMENT_UPLOAD',
          actorId: admin.id,
          documentId: data.id,
          result: 'SUCCESS',
          at: NOON_IN_BUENOS_AIRES,
        },
        TX,
      );
      expect(queue.enqueue).toHaveBeenCalledWith(data.version.id);
      expect(storage.delete).not.toHaveBeenCalled();

      // La respuesta de T13: estados iniciales y sin datos internos.
      expect(response).toMatchObject({
        id: data.id,
        status: 'ACTIVE',
        reviewDate: TOMORROW,
        currentVersion: {
          id: data.version.id,
          versionNumber: 1,
          status: 'CURRENT',
          processingStatus: 'PENDING',
          mimeType: 'application/pdf',
        },
      });
      expect(JSON.stringify(response)).not.toMatch(/storageKey|checksum/);
    });

    it('falla el almacenamiento: 503, sin transacción y sin nada que borrar', async () => {
      storage.put.mockRejectedValue(new StorageUnavailableError('S3 caído'));

      await expect(service.upload(pdf(), dto(), admin)).rejects.toThrow(
        ServiceUnavailableException,
      );
      expect(repository.runInTransaction).not.toHaveBeenCalled();
      expect(storage.delete).not.toHaveBeenCalled();
    });

    it('falla la base: 503, rollback y delete(key)', async () => {
      repository.createWithFirstVersion.mockImplementation(() => {
        events.push('create');
        return Promise.reject(
          new RepositoryUnavailableError('connection terminated'),
        );
      });

      await expect(service.upload(pdf(), dto(), admin)).rejects.toThrow(
        ServiceUnavailableException,
      );
      const key = (storage.put.mock.calls[0] as string[])[0];
      expect(storage.delete).toHaveBeenCalledWith(key);
      expect(queue.enqueue).not.toHaveBeenCalled();
      expect(events).toEqual([
        'put',
        'begin',
        'create',
        'rollback',
        'delete',
        'audit:FAILURE',
      ]);
    });

    it('un error inesperado: 500 genérico, rollback, delete(key), FAILURE con 500 y la causa en el log', async () => {
      repository.createWithFirstVersion.mockImplementation(() => {
        events.push('create');
        return Promise.reject(
          new TypeError("Cannot read properties of undefined (reading 'id')"),
        );
      });

      const error = await service
        .upload(pdf(), dto(), admin)
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(InternalServerErrorException);
      expect((error as Error).message).toBe('No se pudo completar la carga.');
      const key = (storage.put.mock.calls[0] as string[])[0];
      expect(storage.delete).toHaveBeenCalledWith(key);
      expect(events).toEqual([
        'put',
        'begin',
        'create',
        'rollback',
        'delete',
        'audit:FAILURE',
      ]);
      expect(failureAudit()).toEqual([
        expect.objectContaining({ result: 'FAILURE', detail: '500' }),
      ]);
      expect(loggerError).toHaveBeenCalledWith(
        expect.objectContaining({
          cause: "Cannot read properties of undefined (reading 'id')",
        }),
      );
    });

    it('falla el encolado: 503, rollback y delete(key)', async () => {
      queue.enqueue.mockImplementation(() => {
        events.push('enqueue');
        return Promise.reject(new QueueUnavailableError('cola caída'));
      });

      await expect(service.upload(pdf(), dto(), admin)).rejects.toThrow(
        ServiceUnavailableException,
      );
      const key = (storage.put.mock.calls[0] as string[])[0];
      expect(storage.delete).toHaveBeenCalledWith(key);
      expect(events).toEqual([
        'put',
        'begin',
        'create',
        'audit:SUCCESS',
        'enqueue',
        'rollback',
        'delete',
        'audit:FAILURE',
      ]);
    });

    it('falla también el delete: sigue siendo 503 y se registra key, documentId y causa', async () => {
      queue.enqueue.mockRejectedValue(new QueueUnavailableError('cola caída'));
      storage.delete.mockRejectedValue(new StorageUnavailableError('S3 caído'));

      await expect(service.upload(pdf(), dto(), admin)).rejects.toThrow(
        ServiceUnavailableException,
      );
      const data = createdData();
      expect(loggerError).toHaveBeenCalledWith(
        expect.objectContaining({
          key: data.version.storageKey,
          documentId: data.id,
          cause: 'S3 caído',
        }),
      );
    });

    it('un rechazo de las validaciones (409) registra FAILURE con su código, sin transacción', async () => {
      repository.findActiveByChecksum.mockResolvedValue({
        documentId: EXISTING_DOCUMENT,
      });

      await expect(service.upload(pdf(), dto(), admin)).rejects.toThrow(
        ConflictException,
      );
      expect(failureAudit()).toEqual([
        {
          action: 'DOCUMENT_UPLOAD',
          actorId: admin.id,
          result: 'FAILURE',
          detail: '409',
          at: NOON_IN_BUENOS_AIRES,
        },
      ]);
    });

    it('un 503 registra FAILURE con su código, fuera de la transacción y después del rollback', async () => {
      queue.enqueue.mockRejectedValue(new QueueUnavailableError('cola caída'));

      await expect(service.upload(pdf(), dto(), admin)).rejects.toThrow(
        ServiceUnavailableException,
      );
      expect(failureAudit()).toEqual([
        expect.objectContaining({ result: 'FAILURE', detail: '503' }),
      ]);
      expect(events.indexOf('audit:FAILURE')).toBeGreaterThan(
        events.indexOf('rollback'),
      );
    });

    it('si la auditoría del fallo también falla, se responde con el error original', async () => {
      storage.put.mockRejectedValue(new StorageUnavailableError('S3 caído'));
      audit.record.mockRejectedValue(new Error('auditoría caída'));

      await expect(service.upload(pdf(), dto(), admin)).rejects.toThrow(
        ServiceUnavailableException,
      );
      expect(loggerError).toHaveBeenCalled();
    });

    it('un nombre original de 300 caracteres se guarda recortado a 255', async () => {
      const longName = `${'a'.repeat(296)}.pdf`;

      await service.upload(pdf(longName), dto(), admin);

      expect(createdData().version.originalFileName).toBe(
        longName.slice(0, 255),
      );
    });
  });
});
