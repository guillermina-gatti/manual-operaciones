import {
  BadRequestException,
  ConflictException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import type { AuthUser } from '../common/auth';
import type { FileStorage } from '../storage/file-storage';
import { AREA_IDS, FIXTURE_USERS } from './adapters/fixtures';
import { DocumentUploadService } from './document-upload.service';
import type { DocumentsRepository } from './documents.repository';
import type { CreateDocumentDto } from './dto/create-document.dto';
import type { AreasDirectory } from './ports/areas-directory';
import type { UsersDirectory } from './ports/users-directory';

const UNKNOWN_AREA = '0a000000-0000-4000-8000-000000000099';
const EXISTING_DOCUMENT = '0c000000-0000-4000-8000-000000000001';

// 22/10/2026 a las 12:00 en Buenos Aires (UTC−3).
const NOON_IN_BUENOS_AIRES = new Date('2026-10-22T15:00:00.000Z');
const TODAY = '2026-10-22';
const YESTERDAY = '2026-10-21';
const TOMORROW = '2026-10-23';

const admin: AuthUser = { id: FIXTURE_USERS.admin.id, role: 'ADMIN' };
const pdf = () => ({
  originalname: 'manual.pdf',
  buffer: Buffer.from('%PDF-1.7\ncontenido'),
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

describe('DocumentUploadService: validaciones previas a escribir', () => {
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
  let service: DocumentUploadService;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(NOON_IN_BUENOS_AIRES);

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
      runInTransaction: jest.fn(),
      createWithFirstVersion: jest.fn(),
      list: jest.fn(),
      findByIdWithAreas: jest.fn(),
    };
    storage = { put: jest.fn(), delete: jest.fn(), getDownloadUrl: jest.fn() };

    service = new DocumentUploadService(
      areas as unknown as AreasDirectory,
      users as unknown as UsersDirectory,
      repository as unknown as DocumentsRepository,
      storage as unknown as FileStorage,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const expectNothingWritten = () => {
    expect(storage.put).not.toHaveBeenCalled();
    expect(repository.runInTransaction).not.toHaveBeenCalled();
  };

  it('una carga válida pasa las validaciones', async () => {
    await expect(service.upload(pdf(), dto(), admin)).resolves.not.toThrow();
  });

  describe('archivo (3b)', () => {
    it('extensión falsa: 415 y no consulta nada más', async () => {
      const fake = { originalname: 'manual.pdf', buffer: Buffer.from('hola') };

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
      const withPath = { ...pdf(), originalname: '../../manual.pdf' };

      await expect(
        service.upload(withPath, dto(), admin),
      ).resolves.not.toThrow();
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
      await expect(
        service.upload(pdf(), dto({ reviewDate: TOMORROW }), admin),
      ).resolves.not.toThrow();
    });

    it('a las 23:30 de Buenos Aires, "mañana" se calcula en Buenos Aires', async () => {
      // 22/10 a las 23:30 en Buenos Aires = 23/10 a las 02:30 en UTC.
      jest.setSystemTime(new Date('2026-10-23T02:30:00.000Z'));

      await expect(
        service.upload(pdf(), dto({ reviewDate: '2026-10-23' }), admin),
      ).resolves.not.toThrow();
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
      await expect(
        service.upload(
          pdf(),
          dto({
            areaIds: [AREA_IDS.operaciones],
            ownerId: FIXTURE_USERS.supervisorOperaciones.id,
          }),
          admin,
        ),
      ).resolves.not.toThrow();
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
