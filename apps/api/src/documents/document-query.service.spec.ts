/*Pruebas unitarias de consultas, historial y búsqueda de documentos */
import {
  InternalServerErrorException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { AuthUser } from '../common/auth';
import { StorageUnavailableError } from '../storage/file-storage';
import type { FileStorage } from '../storage/file-storage';
import { AREA_IDS, FIXTURE_USERS } from './adapters/fixtures';
import { listWhere } from './document-access.policy';
import { DocumentQueryService } from './document-query.service';
import { RepositoryUnavailableError } from './documents.repository';
import type {
  DocumentRecord,
  DocumentsRepository,
} from './documents.repository';
import type { ListDocumentsQuery } from './dto/list-documents.query';
import type { UsersDirectory } from './ports/users-directory';

const admin: AuthUser = {
  id: FIXTURE_USERS.admin.id,
  email: 'admin@empresa.com',
  name: 'Admin',
  role: 'ADMIN',
  areaIds: [...FIXTURE_USERS.admin.areaIds],
};
const empleadoVentas: AuthUser = {
  id: FIXTURE_USERS.empleadoVentas.id,
  email: 'empleado.ventas@empresa.com',
  name: 'Empleado Ventas',
  role: 'EMPLOYEE',
  areaIds: [...FIXTURE_USERS.empleadoVentas.areaIds],
};
const defaultQuery: ListDocumentsQuery = { page: 1, limit: 20 };

const record: DocumentRecord = {
  id: '0c000000-0000-4000-8000-000000000001',
  title: 'Manual de caja',
  description: null,
  status: 'ACTIVE',
  areaIds: [AREA_IDS.ventas],
  ownerId: FIXTURE_USERS.supervisorVentas.id,
  reviewDate: new Date('2027-03-01T00:00:00.000Z'),
  createdById: FIXTURE_USERS.admin.id,
  createdAt: new Date('2026-10-22T12:00:00.000Z'),
  currentVersion: {
    id: '0d000000-0000-4000-8000-000000000001',
    versionNumber: 1,
    status: 'CURRENT',
    storageKey: 'documents/x/y.pdf',
    originalFileName: 'manual.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 2097152,
    checksum:
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    processingStatus: 'PENDING',
    createdAt: new Date('2026-10-22T12:00:00.000Z'),
  },
};

describe('DocumentQueryService.list', () => {
  let users: { findById: jest.Mock };
  let repository: { list: jest.Mock };
  let service: DocumentQueryService;

  beforeEach(() => {
    users = {
      findById: jest.fn((id: string) =>
        Promise.resolve(
          Object.values(FIXTURE_USERS).find((user) => user.id === id) ?? null,
        ),
      ),
    };
    repository = {
      list: jest.fn().mockResolvedValue({ data: [record], total: 1 }),
    };
    service = new DocumentQueryService(
      users as unknown as UsersDirectory,
      repository as unknown as DocumentsRepository,
      { getDownloadUrl: jest.fn() } as unknown as FileStorage,
    );
  });

  it('la consulta por defecto pide la página 1 con 20 documentos', async () => {
    await service.list(empleadoVentas, defaultQuery);

    expect(repository.list).toHaveBeenCalledWith(expect.anything(), 1, 20);
  });

  it('pasa la página y el límite pedidos', async () => {
    await service.list(empleadoVentas, { page: 3, limit: 50 });

    expect(repository.list).toHaveBeenCalledWith(expect.anything(), 3, 50);
  });

  it('para un EMPLOYEE usa el where de la política, con sus áreas de UsersDirectory', async () => {
    await service.list(empleadoVentas, defaultQuery);

    expect(users.findById).toHaveBeenCalledWith(empleadoVentas.id);
    const [where] = repository.list.mock.calls[0] as [unknown];
    expect(where).toEqual(
      listWhere({ role: 'EMPLOYEE', areaIds: [AREA_IDS.ventas] }),
    );
    expect(where).toEqual({
      status: 'ACTIVE',
      areas: { some: { areaId: { in: [AREA_IDS.ventas] } } },
    });
  });

  it('para un ADMIN no hay filtro', async () => {
    await service.list(admin, defaultQuery);

    expect(repository.list).toHaveBeenCalledWith({}, 1, 20);
  });

  it('devuelve { data, total, page, limit } con data mapeado a la respuesta de T13', async () => {
    const response = await service.list(empleadoVentas, defaultQuery);

    expect(response).toEqual({
      data: [
        expect.objectContaining({
          id: record.id,
          reviewDate: '2027-03-01',
          currentVersion: {
            id: record.currentVersion.id,
            versionNumber: 1,
            originalFileName: 'manual.pdf',
            mimeType: 'application/pdf',
            processingStatus: 'PENDING',
          },
        }),
      ],
      total: 1,
      page: 1,
      limit: 20,
    });
    expect(JSON.stringify(response)).not.toMatch(/storageKey|checksum/);
  });

  describe('si no se pueden obtener las áreas, no devuelve documentos de más', () => {
    it('usuario que no está en el directorio: filtra con áreas vacías', async () => {
      const unknown: AuthUser = {
        id: '0b000000-0000-4000-8000-000000000099',
        email: 'desconocido@empresa.com',
        name: 'Desconocido',
        role: 'EMPLOYEE',
        // Sin áreas propias: el test comprueba que tampoco se las inventa el directorio.
        areaIds: [],
      };

      await service.list(unknown, defaultQuery);

      expect(repository.list).toHaveBeenCalledWith(
        {
          status: 'ACTIVE',
          areas: { some: { areaId: { in: [] } } },
        },
        1,
        20,
      );
    });

    it('el directorio falla: rechaza y no consulta documentos', async () => {
      users.findById.mockRejectedValue(new Error('directorio caído'));

      await expect(service.list(empleadoVentas, defaultQuery)).rejects.toThrow(
        InternalServerErrorException,
      );
      expect(repository.list).not.toHaveBeenCalled();
    });
  });
});

describe('DocumentQueryService: detalle y descarga', () => {
  const OTHER_AREA_ID = '0c000000-0000-4000-8000-000000000002';
  const MISSING_ID = '0c000000-0000-4000-8000-000000000099';
  const LINK = {
    url: 'https://bucket.s3.amazonaws.com/documents/x/y.pdf?firma',
    expiresAt: new Date('2026-10-22T12:05:00.000Z'),
  };

  const withVersion = (
    overrides: Partial<DocumentRecord>,
    processingStatus: DocumentRecord['currentVersion']['processingStatus'] = 'PENDING',
  ): DocumentRecord => ({
    ...record,
    ...overrides,
    currentVersion: { ...record.currentVersion, processingStatus },
  });
  const documents: Record<string, DocumentRecord> = {
    [record.id]: record,
    [OTHER_AREA_ID]: withVersion({
      id: OTHER_AREA_ID,
      areaIds: [AREA_IDS.operaciones],
    }),
  };

  let users: { findById: jest.Mock };
  let repository: { findByIdWithAreas: jest.Mock };
  let storage: { getDownloadUrl: jest.Mock };
  let service: DocumentQueryService;

  beforeEach(() => {
    users = {
      findById: jest.fn((id: string) =>
        Promise.resolve(
          Object.values(FIXTURE_USERS).find((user) => user.id === id) ?? null,
        ),
      ),
    };
    repository = {
      findByIdWithAreas: jest.fn((id: string) =>
        Promise.resolve(documents[id] ?? null),
      ),
    };
    storage = { getDownloadUrl: jest.fn().mockResolvedValue(LINK) };
    service = new DocumentQueryService(
      users as unknown as UsersDirectory,
      repository as unknown as DocumentsRepository,
      storage as unknown as FileStorage,
    );
  });

  const errorOf = (promise: Promise<unknown>) =>
    promise.then(
      () => {
        throw new Error('se esperaba un error');
      },
      (error: unknown) => error as NotFoundException,
    );

  describe('documento de otra área', () => {
    it('detalle: 404', async () => {
      await expect(
        service.findOne(empleadoVentas, OTHER_AREA_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it('descarga: 404 y el almacenamiento nunca genera un enlace', async () => {
      await expect(
        service.getDownloadUrl(empleadoVentas, OTHER_AREA_ID),
      ).rejects.toThrow(NotFoundException);
      expect(storage.getDownloadUrl).not.toHaveBeenCalled();
    });
  });

  it('inexistente y no visible responden el mismo 404, con el mismo mensaje', async () => {
    const missing = await errorOf(service.findOne(empleadoVentas, MISSING_ID));
    const hidden = await errorOf(
      service.findOne(empleadoVentas, OTHER_AREA_ID),
    );
    const missingDownload = await errorOf(
      service.getDownloadUrl(empleadoVentas, MISSING_ID),
    );
    const hiddenDownload = await errorOf(
      service.getDownloadUrl(empleadoVentas, OTHER_AREA_ID),
    );

    for (const error of [missing, hidden, missingDownload, hiddenDownload]) {
      expect(error).toBeInstanceOf(NotFoundException);
    }
    expect(hidden.message).toBe(missing.message);
    expect(hidden.getResponse()).toEqual(missing.getResponse());
    expect(hiddenDownload.getResponse()).toEqual(missing.getResponse());
    expect(missingDownload.getResponse()).toEqual(missing.getResponse());
    expect(storage.getDownloadUrl).not.toHaveBeenCalled();
  });

  it('un EMPLOYEE no ve un documento ARCHIVED de su área', async () => {
    repository.findByIdWithAreas.mockResolvedValue(
      withVersion({ status: 'ARCHIVED' }),
    );

    await expect(service.findOne(empleadoVentas, record.id)).rejects.toThrow(
      NotFoundException,
    );
    await expect(
      service.getDownloadUrl(empleadoVentas, record.id),
    ).rejects.toThrow(NotFoundException);
    expect(storage.getDownloadUrl).not.toHaveBeenCalled();
  });

  it('detalle visible: la respuesta de T13, sin datos internos', async () => {
    const response = await service.findOne(empleadoVentas, record.id);

    expect(response).toMatchObject({
      id: record.id,
      reviewDate: '2027-03-01',
      currentVersion: { id: record.currentVersion.id, versionNumber: 1 },
    });
    expect(JSON.stringify(response)).not.toMatch(/storageKey|checksum/);
  });

  describe('descarga permitida', () => {
    it('con PENDING devuelve { url, expiresAt }', async () => {
      await expect(
        service.getDownloadUrl(empleadoVentas, record.id),
      ).resolves.toEqual(LINK);
      expect(storage.getDownloadUrl).toHaveBeenCalledWith(
        record.currentVersion.storageKey,
        'manual.pdf',
      );
    });

    it('con FAILED también', async () => {
      repository.findByIdWithAreas.mockResolvedValue(withVersion({}, 'FAILED'));

      await expect(
        service.getDownloadUrl(empleadoVentas, record.id),
      ).resolves.toEqual(LINK);
    });

    it('un ADMIN descarga un ARCHIVED', async () => {
      repository.findByIdWithAreas.mockResolvedValue(
        withVersion({ status: 'ARCHIVED', areaIds: [AREA_IDS.operaciones] }),
      );

      await expect(service.getDownloadUrl(admin, record.id)).resolves.toEqual(
        LINK,
      );
    });

    it('el enlace se pide después de comprobar la visibilidad', async () => {
      await service.getDownloadUrl(empleadoVentas, record.id);

      const [linkOrder] = storage.getDownloadUrl.mock.invocationCallOrder;
      expect(users.findById.mock.invocationCallOrder[0]).toBeLessThan(
        linkOrder,
      );
      expect(
        repository.findByIdWithAreas.mock.invocationCallOrder[0],
      ).toBeLessThan(linkOrder);
    });
  });

  it('si el directorio falla, no se genera ningún enlace', async () => {
    users.findById.mockRejectedValue(new Error('directorio caído'));

    await expect(
      service.getDownloadUrl(empleadoVentas, record.id),
    ).rejects.toThrow(InternalServerErrorException);
    expect(storage.getDownloadUrl).not.toHaveBeenCalled();
  });
});

describe('DocumentQueryService: dependencias no disponibles (D13)', () => {
  let users: { findById: jest.Mock };
  let repository: { list: jest.Mock; findByIdWithAreas: jest.Mock };
  let storage: { getDownloadUrl: jest.Mock };
  let loggerError: jest.SpyInstance;
  let service: DocumentQueryService;

  beforeEach(() => {
    loggerError = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => {});
    users = {
      findById: jest.fn().mockResolvedValue(FIXTURE_USERS.empleadoVentas),
    };
    repository = {
      list: jest.fn().mockResolvedValue({ data: [record], total: 1 }),
      findByIdWithAreas: jest.fn().mockResolvedValue(record),
    };
    storage = {
      getDownloadUrl: jest.fn().mockResolvedValue({
        url: 'https://bucket/x',
        expiresAt: new Date(),
      }),
    };
    service = new DocumentQueryService(
      users as unknown as UsersDirectory,
      repository as unknown as DocumentsRepository,
      storage as unknown as FileStorage,
    );
  });

  afterEach(() => {
    loggerError.mockRestore();
  });

  const repositoryDown = () =>
    new RepositoryUnavailableError('connection terminated');

  describe('listado', () => {
    it('la base no responde: 503', async () => {
      repository.list.mockRejectedValue(repositoryDown());

      await expect(service.list(empleadoVentas, defaultQuery)).rejects.toThrow(
        ServiceUnavailableException,
      );
    });

    it('el directorio no responde: 503 y no se consultan documentos', async () => {
      users.findById.mockRejectedValue(repositoryDown());

      await expect(service.list(empleadoVentas, defaultQuery)).rejects.toThrow(
        ServiceUnavailableException,
      );
      expect(repository.list).not.toHaveBeenCalled();
    });
  });

  describe('detalle', () => {
    it('la base no responde: 503', async () => {
      repository.findByIdWithAreas.mockRejectedValue(repositoryDown());

      await expect(service.findOne(empleadoVentas, record.id)).rejects.toThrow(
        ServiceUnavailableException,
      );
    });

    it('el directorio no responde: 503', async () => {
      users.findById.mockRejectedValue(repositoryDown());

      await expect(service.findOne(empleadoVentas, record.id)).rejects.toThrow(
        ServiceUnavailableException,
      );
    });
  });

  describe('descarga', () => {
    it('el almacenamiento no responde: 503', async () => {
      storage.getDownloadUrl.mockRejectedValue(
        new StorageUnavailableError('sin credenciales'),
      );

      await expect(
        service.getDownloadUrl(empleadoVentas, record.id),
      ).rejects.toThrow(ServiceUnavailableException);
    });

    it('la base no responde: 503 y no se genera ningún enlace', async () => {
      repository.findByIdWithAreas.mockRejectedValue(repositoryDown());

      await expect(
        service.getDownloadUrl(empleadoVentas, record.id),
      ).rejects.toThrow(ServiceUnavailableException);
      expect(storage.getDownloadUrl).not.toHaveBeenCalled();
    });

    it('el directorio no responde: 503 y no se genera ningún enlace', async () => {
      users.findById.mockRejectedValue(repositoryDown());

      await expect(
        service.getDownloadUrl(empleadoVentas, record.id),
      ).rejects.toThrow(ServiceUnavailableException);
      expect(storage.getDownloadUrl).not.toHaveBeenCalled();
    });
  });

  it('el 503 tiene un mensaje genérico y la causa va al log', async () => {
    repository.list.mockRejectedValue(repositoryDown());

    const error = (await service
      .list(empleadoVentas, defaultQuery)
      .catch((e: unknown) => e)) as Error;

    expect(error.message).not.toMatch(/connection/);
    expect(loggerError).toHaveBeenCalledWith(
      expect.objectContaining({ cause: 'connection terminated' }),
    );
  });

  it('un error inesperado sigue siendo 500 genérico, con la causa en el log', async () => {
    repository.findByIdWithAreas.mockRejectedValue(
      new TypeError("Cannot read properties of undefined (reading 'id')"),
    );

    const error = (await service
      .findOne(empleadoVentas, record.id)
      .catch((e: unknown) => e)) as Error;

    expect(error).toBeInstanceOf(InternalServerErrorException);
    expect(error.message).toBe('No se pudo completar la consulta.');
    expect(loggerError).toHaveBeenCalledWith(
      expect.objectContaining({
        cause: "Cannot read properties of undefined (reading 'id')",
      }),
    );
  });

  it('el 404 de R11 no se convierte en otro error', async () => {
    repository.findByIdWithAreas.mockResolvedValue(null);

    await expect(service.findOne(empleadoVentas, record.id)).rejects.toThrow(
      NotFoundException,
    );
  });
});

describe('DocumentQueryService: historial y descarga de una versión (spec 003, R12)', () => {
  const v2 = {
    ...record.currentVersion,
    id: '0d000000-0000-4000-8000-000000000002',
    versionNumber: 2,
    storageKey: 'documents/x/v2.pdf',
    originalFileName: 'manual v2.pdf',
    uploadedById: FIXTURE_USERS.admin.id,
  };
  const v1 = {
    ...record.currentVersion,
    status: 'REPLACED' as const,
    processingStatus: 'READY' as const,
    uploadedById: FIXTURE_USERS.admin.id,
  };
  const archived: DocumentRecord = {
    ...record,
    status: 'ARCHIVED',
    archivedAt: new Date('2026-10-23T12:00:00.000Z'),
  };
  const DOWNLOAD = {
    url: 'https://bucket.s3.amazonaws.com/firmada',
    expiresAt: '2026-10-22T12:05:00.000Z',
  };

  let repository: {
    findByIdWithAreas: jest.Mock;
    listVersions: jest.Mock;
    findVersion: jest.Mock;
  };
  let storage: { getDownloadUrl: jest.Mock };
  let service: DocumentQueryService;

  beforeEach(() => {
    repository = {
      findByIdWithAreas: jest.fn().mockResolvedValue(record),
      listVersions: jest.fn().mockResolvedValue([v2, v1]),
      findVersion: jest.fn().mockResolvedValue(v1),
    };
    storage = { getDownloadUrl: jest.fn().mockResolvedValue(DOWNLOAD) };
    service = new DocumentQueryService(
      { findById: jest.fn() } as unknown as UsersDirectory,
      repository as unknown as DocumentsRepository,
      storage as unknown as FileStorage,
    );
  });

  describe('listVersions', () => {
    it('devuelve las versiones en el orden del repositorio, sin storageKey ni checksum', async () => {
      const response = await service.listVersions(record.id);

      expect(repository.listVersions).toHaveBeenCalledWith(record.id);
      expect(response).toEqual({
        data: [
          {
            id: v2.id,
            versionNumber: 2,
            status: 'CURRENT',
            originalFileName: 'manual v2.pdf',
            mimeType: 'application/pdf',
            sizeBytes: 2097152,
            processingStatus: 'PENDING',
            uploadedById: FIXTURE_USERS.admin.id,
            createdAt: '2026-10-22T12:00:00.000Z',
          },
          expect.objectContaining({ id: v1.id, status: 'REPLACED' }),
        ],
      });
      expect(JSON.stringify(response)).not.toMatch(/storageKey|checksum/);
    });

    it('404 si el documento no existe, sin pedir las versiones', async () => {
      repository.findByIdWithAreas.mockResolvedValue(null);

      await expect(service.listVersions(record.id)).rejects.toThrow(
        new NotFoundException('No se encontró el documento'),
      );
      expect(repository.listVersions).not.toHaveBeenCalled();
    });

    it('funciona con un documento archivado (D10)', async () => {
      repository.findByIdWithAreas.mockResolvedValue(archived);

      await expect(service.listVersions(record.id)).resolves.toMatchObject({
        data: [{ id: v2.id }, { id: v1.id }],
      });
    });

    it('si la base no responde → 503', async () => {
      repository.listVersions.mockRejectedValue(
        new RepositoryUnavailableError('timeout'),
      );

      await expect(service.listVersions(record.id)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });
  });

  describe('getVersionDownloadUrl', () => {
    it('pide el enlace de esa versión, con su clave y su nombre', async () => {
      await expect(
        service.getVersionDownloadUrl(record.id, v1.id),
      ).resolves.toEqual(DOWNLOAD);

      expect(repository.findVersion).toHaveBeenCalledWith(record.id, v1.id);
      expect(storage.getDownloadUrl).toHaveBeenCalledWith(
        v1.storageKey,
        v1.originalFileName,
      );
    });

    it('una versión de otro documento (o un documento que no existe) → 404 y nunca pide el enlace', async () => {
      repository.findVersion.mockResolvedValue(null);

      await expect(
        service.getVersionDownloadUrl(record.id, v1.id),
      ).rejects.toThrow(new NotFoundException('No se encontró el documento'));
      expect(storage.getDownloadUrl).not.toHaveBeenCalled();
    });

    it('funciona con un documento archivado (D10)', async () => {
      repository.findByIdWithAreas.mockResolvedValue(archived);

      await expect(
        service.getVersionDownloadUrl(record.id, v1.id),
      ).resolves.toEqual(DOWNLOAD);
    });

    it('si el almacenamiento no responde → 503', async () => {
      storage.getDownloadUrl.mockRejectedValue(
        new StorageUnavailableError('caído'),
      );

      await expect(
        service.getVersionDownloadUrl(record.id, v1.id),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    });
  });
});

// Spec 004 (T07; plan 004, 3.1): la búsqueda une el visor, la política, el repositorio y buildFragment.
describe('DocumentQueryService.search', () => {
  const START = '\uE000';
  const END = '\uE001';
  let users: { findById: jest.Mock };
  let repository: { search: jest.Mock };
  let service: DocumentQueryService;

  beforeEach(() => {
    users = {
      findById: jest.fn((id: string) =>
        Promise.resolve(
          Object.values(FIXTURE_USERS).find((user) => user.id === id) ?? null,
        ),
      ),
    };
    repository = {
      search: jest.fn().mockResolvedValue({ data: [], total: 0 }),
    };
    service = new DocumentQueryService(
      users as unknown as UsersDirectory,
      repository as unknown as DocumentsRepository,
      { getDownloadUrl: jest.fn() } as unknown as FileStorage,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('pide primero el visor y busca con el alcance de la política (sus áreas)', async () => {
    await service.search(empleadoVentas, { q: 'caja', page: 2, limit: 10 });

    expect(users.findById).toHaveBeenCalledWith(empleadoVentas.id);
    expect(users.findById.mock.invocationCallOrder[0]).toBeLessThan(
      repository.search.mock.invocationCallOrder[0],
    );
    expect(repository.search).toHaveBeenCalledWith({
      text: 'caja',
      scope: { areaIds: [AREA_IDS.ventas] },
      page: 2,
      limit: 10,
    });
  });

  it('para un ADMIN busca sin filtro de áreas', async () => {
    await service.search(admin, { q: 'caja', page: 1, limit: 20 });

    expect(repository.search).toHaveBeenCalledWith(
      expect.objectContaining({ scope: { areaIds: null } }),
    );
  });

  it('E1: arma el fragmento sin marcadores y con su página', async () => {
    repository.search.mockResolvedValue({
      data: [
        {
          record,
          fragment: {
            markedText: `el ${START}cierre${END} de ${START}caja${END}`,
            pageNumber: 4,
          },
        },
      ],
      total: 1,
    });

    const response = await service.search(empleadoVentas, {
      q: 'cierre de caja',
      page: 1,
      limit: 20,
    });

    expect(response).toEqual({
      data: [
        expect.objectContaining({
          id: record.id,
          title: record.title,
          fragment: {
            parts: [
              { text: 'el ', match: false },
              { text: 'cierre', match: true },
              { text: ' de ', match: false },
              { text: 'caja', match: true },
            ],
            pageNumber: 4,
          },
        }),
      ],
      total: 1,
      page: 1,
      limit: 20,
    });
    // Lo mismo que el listado: sin storageKey ni checksum.
    expect(JSON.stringify(response)).not.toMatch(/storageKey|checksum/);
  });

  it('E2: sin coincidencia en el contenido, fragment es null', async () => {
    repository.search.mockResolvedValue({
      data: [{ record, fragment: null }],
      total: 1,
    });

    const response = await service.search(admin, { q: 'caja', page: 1, limit: 20 });

    expect(response.data[0].fragment).toBeNull();
  });

  it('si el directorio de usuarios falla: 503 y nunca busca sin filtro', async () => {
    users.findById.mockRejectedValue(new RepositoryUnavailableError('directorio caído'));
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});

    await expect(
      service.search(empleadoVentas, { q: 'caja', page: 1, limit: 20 }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(repository.search).not.toHaveBeenCalled();
  });

  it('R12: si la base no responde, 503 con el mensaje de la búsqueda', async () => {
    repository.search.mockRejectedValue(new RepositoryUnavailableError('base caída'));
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});

    await expect(
      service.search(admin, { q: 'caja', page: 1, limit: 20 }),
    ).rejects.toThrow('No se pudo completar la búsqueda. Intentá de nuevo más tarde.');
  });

  it('un error inesperado es 500 con mensaje genérico', async () => {
    repository.search.mockRejectedValue(new Error('x is undefined'));
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});

    const failure = service.search(admin, { q: 'caja', page: 1, limit: 20 });

    await expect(failure).rejects.toBeInstanceOf(InternalServerErrorException);
    await expect(failure).rejects.toThrow('No se pudo completar la búsqueda.');
  });
});
