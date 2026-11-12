import {
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { SPEC_USERS } from '../../test/executions/real-auth';
import { NOW, PROCEDURE_ID, VERSION_ID, record } from '../../test/procedures/version-fixtures';
import type { AuthUser } from '../common/auth';
import { ProcedurePublishService } from './procedure-publish.service';
import { ProceduresRepositoryUnavailableError } from './procedures.repository';
import type { PublishRepository } from './publish.repository';

const ADMIN: AuthUser = SPEC_USERS.admin;
const SUPERVISOR: AuthUser = SPEC_USERS.supervisorVentas;
const EMPLOYEE: AuthUser = SPEC_USERS.empleadoVentas;

// The reason of a 409, to check it next to the status.
const conflictReason = async (promise: Promise<unknown>) => {
  const error = await promise.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(ConflictException);
  return (error as ConflictException).getResponse();
};

describe('ProcedurePublishService', () => {
  let publisher: { publish: jest.Mock };
  let service: ProcedurePublishService;
  let loggerError: jest.SpyInstance;

  beforeEach(() => {
    jest.useFakeTimers({ now: NOW });
    publisher = { publish: jest.fn() };
    loggerError = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    service = new ProcedurePublishService(publisher as unknown as PublishRepository);
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
        expect(publisher.publish).not.toHaveBeenCalled();
      },
    );

    it('R2: publishes with the caller and the time of the request, without a critical change by default', async () => {
      publisher.publish.mockResolvedValue({ ok: true, value: record() });

      await publish();

      expect(publisher.publish).toHaveBeenCalledWith({
        procedureId: PROCEDURE_ID,
        versionId: VERSION_ID,
        publishedById: ADMIN.id,
        publishedAt: NOW,
        isCritical: false,
        changeSummary: null,
      });
    });

    it('R5: passes the critical change and its summary', async () => {
      publisher.publish.mockResolvedValue({ ok: true, value: record() });

      await publish(ADMIN, { isCritical: true, changeSummary: 'Cambia el límite' });

      expect(publisher.publish).toHaveBeenCalledWith(
        expect.objectContaining({ isCritical: true, changeSummary: 'Cambia el límite' }),
      );
    });

    it('gives back the published version with the name of the caller', async () => {
      publisher.publish.mockResolvedValue({ ok: true, value: record() });

      await expect(publish()).resolves.toMatchObject({
        id: VERSION_ID,
        status: 'PUBLISHED',
        publishedById: ADMIN.id,
        publishedByName: ADMIN.name,
      });
    });

    it('R3: NOT_FOUND is a 404 with the same message for a procedure and for a version that is not in it', async () => {
      publisher.publish.mockResolvedValue({ ok: false, reason: 'NOT_FOUND' });

      const error = await publish().catch((e: unknown) => e);

      expect(error).toBeInstanceOf(NotFoundException);
      expect((error as NotFoundException).message).toBe('No se encontró el procedimiento');
    });

    it.each([
      ['NOT_A_DRAFT', 'VERSION_NOT_DRAFT'],
      ['NO_STEPS', 'NO_STEPS'],
      ['NO_AREAS', 'NO_AREAS'],
    ])('R3: %s is a 409 with reason "%s"', async (rejection, reason) => {
      publisher.publish.mockResolvedValue({ ok: false, reason: rejection });

      expect(await conflictReason(publish())).toMatchObject({ statusCode: 409, reason });
    });

    it('E20: a database that does not answer is a 503 without the cause', async () => {
      publisher.publish.mockRejectedValue(new ProceduresRepositoryUnavailableError('base caída'));

      const error = await publish().catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ServiceUnavailableException);
      expect((error as Error).message).not.toContain('base caída');
      expect(loggerError).toHaveBeenCalled();
    });

    it('an unexpected error is a 500 without the cause', async () => {
      publisher.publish.mockRejectedValue(new Error('boom'));

      const error = await publish().catch((e: unknown) => e);

      expect(error).toBeInstanceOf(InternalServerErrorException);
      expect((error as Error).message).not.toContain('boom');
    });
  });
});
