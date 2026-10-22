import type { AuthUser } from '../common/auth';
import { AREA_IDS, FIXTURE_USERS } from './adapters/fixtures';
import { listWhere } from './document-access.policy';
import { DocumentQueryService } from './document-query.service';
import type {
  DocumentRecord,
  DocumentsRepository,
} from './documents.repository';
import type { ListDocumentsQuery } from './dto/list-documents.query';
import type { UsersDirectory } from './ports/users-directory';

const admin: AuthUser = { id: FIXTURE_USERS.admin.id, role: 'ADMIN' };
const empleadoVentas: AuthUser = {
  id: FIXTURE_USERS.empleadoVentas.id,
  role: 'EMPLOYEE',
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
        role: 'EMPLOYEE',
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
        'directorio caído',
      );
      expect(repository.list).not.toHaveBeenCalled();
    });
  });
});
