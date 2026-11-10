import {
  ForbiddenException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { SPEC_USERS } from '../../test/executions/real-auth';
import { PROCEDURE_ID, VERSION_ID, detail, record } from '../../test/procedures/version-fixtures';
import type { AuthUser } from '../common/auth';
import { RepositoryUnavailableError } from '../documents/documents.repository';
import type { UsersDirectory } from '../documents/ports/users-directory';
import { ProcedureHistoryService } from './procedure-history.service';
import type { VersionsRepository } from './versions.repository';

const ADMIN: AuthUser = SPEC_USERS.admin;
const SUPERVISOR: AuthUser = SPEC_USERS.supervisorVentas;
const EMPLOYEE: AuthUser = SPEC_USERS.empleadoVentas;
const OTHER_PUBLISHER = '0b000000-0000-4000-8000-000000000099';

describe('ProcedureHistoryService', () => {
  let versions: Record<'list' | 'findVersion', jest.Mock>;
  let users: { findById: jest.Mock };
  let service: ProcedureHistoryService;

  beforeEach(() => {
    versions = { list: jest.fn(), findVersion: jest.fn() };
    users = { findById: jest.fn() };
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    service = new ProcedureHistoryService(
      versions as unknown as VersionsRepository,
      users as unknown as UsersDirectory,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('list', () => {
    const list = (user: AuthUser = ADMIN) => service.list(user, PROCEDURE_ID, 1, 20);

    it.each([['SUPERVISOR', SUPERVISOR], ['EMPLOYEE', EMPLOYEE]])(
      'R1: %s gets 403 before anything is looked up',
      async (_role, user) => {
        await expect(list(user)).rejects.toBeInstanceOf(ForbiddenException);
        expect(versions.list).not.toHaveBeenCalled();
      },
    );

    it('R8: a procedure that does not exist is a 404', async () => {
      versions.list.mockResolvedValue(null);

      await expect(list()).rejects.toBeInstanceOf(NotFoundException);
    });

    it('R8: gives the page with the name of who published each version, asking the directory once per person', async () => {
      versions.list.mockResolvedValue({
        data: [
          record({ versionNumber: 3, status: 'DRAFT', publishedAt: null, publishedById: null }),
          record({ versionNumber: 2, publishedById: ADMIN.id }),
          record({ versionNumber: 1, status: 'SUPERSEDED', publishedById: ADMIN.id }),
          record({ versionNumber: 0, status: 'SUPERSEDED', publishedById: OTHER_PUBLISHER }),
        ],
        total: 4,
      });
      users.findById.mockImplementation((id: string) =>
        Promise.resolve(id === ADMIN.id ? { id, name: 'Ana Administradora' } : null),
      );

      const page = await list();

      expect(users.findById).toHaveBeenCalledTimes(2);
      expect(page.total).toBe(4);
      expect(page.data.map((version) => version.publishedByName)).toEqual([
        null,
        'Ana Administradora',
        'Ana Administradora',
        null,
      ]);
      expect(page.data[3].publishedById).toBe(OTHER_PUBLISHER);
    });

    it('passes the page and the limit to the repository', async () => {
      versions.list.mockResolvedValue({ data: [], total: 0 });

      await service.list(ADMIN, PROCEDURE_ID, 3, 50);

      expect(versions.list).toHaveBeenCalledWith(PROCEDURE_ID, 3, 50);
    });

    it('a directory that does not answer is a 503', async () => {
      versions.list.mockResolvedValue({ data: [record()], total: 1 });
      users.findById.mockRejectedValue(new RepositoryUnavailableError('directorio caído'));

      await expect(list()).rejects.toBeInstanceOf(ServiceUnavailableException);
    });
  });

  describe('getVersion', () => {
    const getVersion = (user: AuthUser = ADMIN) =>
      service.getVersion(user, PROCEDURE_ID, VERSION_ID);

    it.each([['SUPERVISOR', SUPERVISOR], ['EMPLOYEE', EMPLOYEE]])(
      'R1: %s gets 403 and the repository is not called',
      async (_role, user) => {
        await expect(getVersion(user)).rejects.toBeInstanceOf(ForbiddenException);
        expect(versions.findVersion).not.toHaveBeenCalled();
      },
    );

    it('R9: a version that is not there, or is of another procedure, is a 404 with the usual message', async () => {
      versions.findVersion.mockResolvedValue(null);

      const error = await getVersion().catch((e: unknown) => e);

      expect(error).toBeInstanceOf(NotFoundException);
      expect((error as NotFoundException).message).toBe('No se encontró el procedimiento');
    });

    it('R9: gives a SUPERSEDED version with its steps and the name of who published it', async () => {
      versions.findVersion.mockResolvedValue(detail({ status: 'SUPERSEDED' }));
      users.findById.mockResolvedValue({ id: ADMIN.id, name: 'Ana Administradora' });

      await expect(getVersion()).resolves.toMatchObject({
        status: 'SUPERSEDED',
        publishedByName: 'Ana Administradora',
        steps: [{ id: 's1', order: 1, title: 'Contar', description: '' }],
      });
    });

    it('a draft has no one who published it, so the directory is not asked', async () => {
      versions.findVersion.mockResolvedValue(
        detail({ status: 'DRAFT', publishedAt: null, publishedById: null }),
      );

      await expect(getVersion()).resolves.toMatchObject({ publishedByName: null });
      expect(users.findById).not.toHaveBeenCalled();
    });

    it('a person that the directory does not know leaves the name empty, not the version', async () => {
      versions.findVersion.mockResolvedValue(detail());
      users.findById.mockResolvedValue(null);

      await expect(getVersion()).resolves.toMatchObject({
        publishedById: ADMIN.id,
        publishedByName: null,
      });
    });
  });
});
