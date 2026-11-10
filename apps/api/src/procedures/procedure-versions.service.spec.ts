import {
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { SPEC_USERS } from '../../test/executions/real-auth';
import type { AuthUser } from '../common/auth';
import { RepositoryUnavailableError } from '../documents/documents.repository';
import type { UsersDirectory } from '../documents/ports/users-directory';
import { ProcedureVersionsService } from './procedure-versions.service';
import { ProceduresRepositoryUnavailableError } from './procedures.repository';
import type { VersionDetailRecord, VersionHistoryRecord, VersionsRepository } from './versions.repository';

const ADMIN: AuthUser = SPEC_USERS.admin;
const SUPERVISOR: AuthUser = SPEC_USERS.supervisorVentas;
const EMPLOYEE: AuthUser = SPEC_USERS.empleadoVentas;

const PROCEDURE_ID = '1a000000-0000-4000-8000-000000000001';
const VERSION_ID = '1b000000-0000-4000-8000-000000000002';
const OTHER_PUBLISHER = '0b000000-0000-4000-8000-000000000099';
const NOW = new Date('2026-11-10T12:00:00.000Z');

const record = (overrides: Partial<VersionHistoryRecord> = {}): VersionHistoryRecord => ({
  id: VERSION_ID,
  procedureId: PROCEDURE_ID,
  versionNumber: 2,
  status: 'PUBLISHED',
  title: 'Cierre de caja',
  createdAt: new Date('2026-11-01T10:00:00.000Z'),
  publishedAt: NOW,
  publishedById: ADMIN.id,
  isCritical: false,
  changeSummary: null,
  stepCount: 2,
  ...overrides,
});

const detail = (overrides: Partial<VersionDetailRecord> = {}): VersionDetailRecord => ({
  ...record(),
  description: null,
  steps: [{ id: 's1', order: 1, title: 'Contar', description: '' }],
  ...overrides,
});

// The reason of a 409, to check it next to the status.
const conflictReason = async (promise: Promise<unknown>) => {
  const error = await promise.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(ConflictException);
  return (error as ConflictException).getResponse();
};

describe('ProcedureVersionsService', () => {
  let versions: Record<'publish' | 'list' | 'findVersion', jest.Mock>;
  let users: { findById: jest.Mock };
  let service: ProcedureVersionsService;
  let loggerError: jest.SpyInstance;

  beforeEach(() => {
    jest.useFakeTimers({ now: NOW });
    versions = { publish: jest.fn(), list: jest.fn(), findVersion: jest.fn() };
    users = { findById: jest.fn() };
    loggerError = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    service = new ProcedureVersionsService(
      versions as unknown as VersionsRepository,
      users as unknown as UsersDirectory,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  describe('publish', () => {
    const publish = (user: AuthUser = ADMIN, dto = {}) =>
      service.publish(user, PROCEDURE_ID, VERSION_ID, dto);

    it.each([['SUPERVISOR', SUPERVISOR], ['EMPLOYEE', EMPLOYEE]])(
      'R1: %s gets 403 and the repository is not called',
      async (_role, user) => {
        await expect(publish(user)).rejects.toBeInstanceOf(ForbiddenException);
        expect(versions.publish).not.toHaveBeenCalled();
      },
    );

    it('R2: publishes with the caller and the time of the request, without a critical change by default', async () => {
      versions.publish.mockResolvedValue({ ok: true, value: record() });

      await publish();

      expect(versions.publish).toHaveBeenCalledWith({
        procedureId: PROCEDURE_ID,
        versionId: VERSION_ID,
        publishedById: ADMIN.id,
        publishedAt: NOW,
        isCritical: false,
        changeSummary: null,
      });
    });

    it('R5: passes the critical change and its summary', async () => {
      versions.publish.mockResolvedValue({ ok: true, value: record() });

      await publish(ADMIN, { isCritical: true, changeSummary: 'Cambia el límite' });

      expect(versions.publish).toHaveBeenCalledWith(
        expect.objectContaining({ isCritical: true, changeSummary: 'Cambia el límite' }),
      );
    });

    it('gives back the published version with the name of the caller', async () => {
      versions.publish.mockResolvedValue({ ok: true, value: record() });

      await expect(publish()).resolves.toMatchObject({
        id: VERSION_ID,
        status: 'PUBLISHED',
        publishedById: ADMIN.id,
        publishedByName: ADMIN.name,
      });
      expect(users.findById).not.toHaveBeenCalled();
    });

    it('R3: NOT_FOUND is a 404 with the same message for a procedure and for a version that is not in it', async () => {
      versions.publish.mockResolvedValue({ ok: false, reason: 'NOT_FOUND' });

      const error = await publish().catch((e: unknown) => e);

      expect(error).toBeInstanceOf(NotFoundException);
      expect((error as NotFoundException).message).toBe('No se encontró el procedimiento');
    });

    it.each([
      ['NOT_A_DRAFT', 'VERSION_NOT_DRAFT'],
      ['NO_STEPS', 'NO_STEPS'],
      ['NO_AREAS', 'NO_AREAS'],
    ])('R3: %s is a 409 with reason "%s"', async (rejection, reason) => {
      versions.publish.mockResolvedValue({ ok: false, reason: rejection });

      expect(await conflictReason(publish())).toMatchObject({ statusCode: 409, reason });
    });

    it('E20: a database that does not answer is a 503 without the cause', async () => {
      versions.publish.mockRejectedValue(new ProceduresRepositoryUnavailableError('base caída'));

      const error = await publish().catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ServiceUnavailableException);
      expect((error as Error).message).not.toContain('base caída');
      expect(loggerError).toHaveBeenCalled();
    });

    it('an unexpected error is a 500 without the cause', async () => {
      versions.publish.mockRejectedValue(new Error('boom'));

      const error = await publish().catch((e: unknown) => e);

      expect(error).toBeInstanceOf(InternalServerErrorException);
      expect((error as Error).message).not.toContain('boom');
    });
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
