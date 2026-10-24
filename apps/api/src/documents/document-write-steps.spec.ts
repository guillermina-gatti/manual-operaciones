import { BadRequestException, ConflictException, Logger } from '@nestjs/common';
import type { AuthUser } from '../common/auth';
import { StorageUnavailableError } from '../storage/file-storage';
import type { FileStorage } from '../storage/file-storage';
import { AREA_IDS, FIXTURE_USERS } from './adapters/fixtures';
import {
  DocumentWriteSteps,
  MAX_ORIGINAL_FILE_NAME_LENGTH,
  truncateFileName,
} from './document-write-steps';
import type { DocumentsRepository } from './documents.repository';
import type { AreasDirectory } from './ports/areas-directory';
import type { AuditLog } from './ports/audit-log';
import type { UsersDirectory } from './ports/users-directory';

const UNKNOWN_AREA = '0a000000-0000-4000-8000-000000000099';
const EXISTING_DOCUMENT = '0c000000-0000-4000-8000-000000000001';

// 22/10/2026 a las 12:00 en Buenos Aires (UTC−3).
const NOON_IN_BUENOS_AIRES = new Date('2026-10-22T15:00:00.000Z');
const TODAY = '2026-10-22';
const YESTERDAY = '2026-10-21';
const TOMORROW = '2026-10-23';

const admin: AuthUser = { id: FIXTURE_USERS.admin.id, role: 'ADMIN' };

const FILE = {
  key: 'documents/doc/version.pdf',
  documentId: 'doc',
  buffer: Buffer.from('%PDF-1.7\ncontenido'),
  mimeType: 'application/pdf',
  checksum: 'a'.repeat(64),
};

describe('DocumentWriteSteps', () => {
  let areas: { findExistingIds: jest.Mock };
  let users: { findById: jest.Mock };
  let repository: { findActiveByChecksum: jest.Mock };
  let storage: { put: jest.Mock; delete: jest.Mock };
  let audit: { record: jest.Mock };
  let loggerError: jest.SpyInstance;
  let steps: DocumentWriteSteps;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(NOON_IN_BUENOS_AIRES);
    loggerError = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);

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
    repository = { findActiveByChecksum: jest.fn().mockResolvedValue(null) };
    storage = {
      put: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    audit = { record: jest.fn().mockResolvedValue(undefined) };

    steps = new DocumentWriteSteps(
      areas as unknown as AreasDirectory,
      users as unknown as UsersDirectory,
      repository as unknown as DocumentsRepository,
      storage as unknown as FileStorage,
      audit as unknown as AuditLog,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
    loggerError.mockRestore();
  });

  describe('assertReviewDateIsAfterToday (R6 de la spec 001)', () => {
    it('mañana pasa', () => {
      expect(() => steps.assertReviewDateIsAfterToday(TOMORROW)).not.toThrow();
    });

    it.each([TODAY, YESTERDAY])('%s da 400 nombrando reviewDate', (date) => {
      expect(() => steps.assertReviewDateIsAfterToday(date)).toThrow(
        new BadRequestException(
          `reviewDate tiene que ser posterior a hoy (${TODAY})`,
        ),
      );
    });

    it('a las 23:30 de Buenos Aires todavía es el mismo día, aunque en UTC ya sea otro', () => {
      // 22/10 23:30 en Buenos Aires = 23/10 02:30 en UTC.
      jest.setSystemTime(new Date('2026-10-23T02:30:00.000Z'));

      expect(() => steps.assertReviewDateIsAfterToday(TODAY)).toThrow(
        BadRequestException,
      );
      expect(() => steps.assertReviewDateIsAfterToday(TOMORROW)).not.toThrow();
    });
  });

  describe('assertAreasExist (R5 de la spec 001)', () => {
    it('con todas las áreas existentes pasa', async () => {
      await expect(
        steps.assertAreasExist([AREA_IDS.ventas, AREA_IDS.operaciones]),
      ).resolves.toBeUndefined();
    });

    it('un área inexistente da 400 que la nombra', async () => {
      await expect(
        steps.assertAreasExist([AREA_IDS.ventas, UNKNOWN_AREA]),
      ).rejects.toThrow(
        new BadRequestException(`areaIds: no existen las áreas ${UNKNOWN_AREA}`),
      );
    });
  });

  describe('assertOwnerCanSeeDocument (R5 de la spec 001)', () => {
    it('un SUPERVISOR de un área compartida pasa', async () => {
      await expect(
        steps.assertOwnerCanSeeDocument(FIXTURE_USERS.supervisorVentas.id, [
          AREA_IDS.ventas,
        ]),
      ).resolves.toBeUndefined();
    });

    it('un ADMIN sin áreas pasa', async () => {
      await expect(
        steps.assertOwnerCanSeeDocument(FIXTURE_USERS.admin.id, [
          AREA_IDS.operaciones,
        ]),
      ).resolves.toBeUndefined();
    });

    it('un responsable que no existe da 400', async () => {
      await expect(
        steps.assertOwnerCanSeeDocument('0b000000-0000-4000-8000-000000000099', [
          AREA_IDS.ventas,
        ]),
      ).rejects.toThrow(
        new BadRequestException('ownerId: el responsable no existe'),
      );
    });

    it('un responsable sin acceso a las áreas da 400', async () => {
      await expect(
        steps.assertOwnerCanSeeDocument(FIXTURE_USERS.empleadoOperaciones.id, [
          AREA_IDS.ventas,
        ]),
      ).rejects.toThrow(
        new BadRequestException(
          'ownerId: el responsable no comparte ningún área con el documento',
        ),
      );
    });
  });

  describe('assertNotDuplicated (R8b de la spec 001)', () => {
    it('sin duplicado pasa', async () => {
      await expect(
        steps.assertNotDuplicated('b'.repeat(64)),
      ).resolves.toBeUndefined();
    });

    it('con duplicado da 409 con existingDocumentId', async () => {
      repository.findActiveByChecksum.mockResolvedValue({
        documentId: EXISTING_DOCUMENT,
      });

      const error = await steps
        .assertNotDuplicated('b'.repeat(64))
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getResponse()).toEqual({
        statusCode: 409,
        message: 'Ya hay un documento vigente con el mismo archivo',
        error: 'Conflict',
        existingDocumentId: EXISTING_DOCUMENT,
      });
    });
  });

  describe('storeThenCommit (R8 de la spec 001: todo o nada)', () => {
    it('guarda el archivo, confirma y devuelve lo que devuelve commit, sin borrar', async () => {
      const commit = jest.fn().mockResolvedValue('confirmado');

      await expect(steps.storeThenCommit(FILE, commit)).resolves.toBe(
        'confirmado',
      );
      expect(storage.put).toHaveBeenCalledWith(
        FILE.key,
        FILE.buffer,
        FILE.mimeType,
        FILE.checksum,
      );
      expect(storage.delete).not.toHaveBeenCalled();
    });

    it('si el almacenamiento falla, no se llama a commit ni se borra nada', async () => {
      storage.put.mockRejectedValue(new StorageUnavailableError('S3 caído'));
      const commit = jest.fn();

      await expect(steps.storeThenCommit(FILE, commit)).rejects.toThrow(
        StorageUnavailableError,
      );
      expect(commit).not.toHaveBeenCalled();
      expect(storage.delete).not.toHaveBeenCalled();
    });

    it('si commit falla, borra el archivo guardado y relanza el error de commit', async () => {
      const events: string[] = [];
      storage.put.mockImplementation(() => {
        events.push('put');
        return Promise.resolve();
      });
      storage.delete.mockImplementation(() => {
        events.push('delete');
        return Promise.resolve();
      });
      const failure = new Error('falló la transacción');
      const commit = jest.fn(() => {
        events.push('commit');
        return Promise.reject(failure);
      });

      await expect(steps.storeThenCommit(FILE, commit)).rejects.toBe(failure);
      expect(events).toEqual(['put', 'commit', 'delete']);
      expect(storage.delete).toHaveBeenCalledWith(FILE.key);
    });

    it('si también falla el delete, registra key, documentId y causa, y relanza el error de commit', async () => {
      storage.delete.mockRejectedValue(new StorageUnavailableError('S3 caído'));
      const failure = new Error('falló la transacción');

      await expect(
        steps.storeThenCommit(FILE, () => Promise.reject(failure)),
      ).rejects.toBe(failure);
      expect(loggerError).toHaveBeenCalledWith(
        expect.objectContaining({
          key: FILE.key,
          documentId: FILE.documentId,
          cause: 'S3 caído',
        }),
      );
    });
  });

  describe('auditFailure (R14 de la spec 001)', () => {
    it('registra FAILURE con el código, sin transacción', async () => {
      await steps.auditFailure('DOCUMENT_UPLOAD', admin, 409);

      expect(audit.record).toHaveBeenCalledWith({
        action: 'DOCUMENT_UPLOAD',
        actorId: admin.id,
        result: 'FAILURE',
        detail: '409',
        at: expect.any(Date) as Date,
      });
      expect(audit.record.mock.calls[0]).toHaveLength(1);
    });

    it('si la auditoría falla, lo registra en el log y no lanza', async () => {
      audit.record.mockRejectedValue(new Error('auditoría caída'));

      await expect(
        steps.auditFailure('DOCUMENT_UPLOAD', admin, 503),
      ).resolves.toBeUndefined();
      expect(loggerError).toHaveBeenCalledWith(
        expect.objectContaining({ actorId: admin.id, status: 503 }),
      );
    });
  });
});

describe('truncateFileName (R9 de la spec 001)', () => {
  it(`recorta a ${MAX_ORIGINAL_FILE_NAME_LENGTH} caracteres`, () => {
    expect(truncateFileName(`${'a'.repeat(296)}.pdf`)).toHaveLength(255);
  });

  it('un nombre corto queda igual', () => {
    expect(truncateFileName('manual de caja.pdf')).toBe('manual de caja.pdf');
  });

  it('no parte un carácter de dos unidades (emoji) ni una tilde', () => {
    const name = `${'á'.repeat(254)}😀😀`;

    const result = truncateFileName(name);

    expect(Array.from(result)).toHaveLength(255);
    expect(result.endsWith('😀')).toBe(true);
  });
});
