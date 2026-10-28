import {
  BadRequestException,
  ForbiddenException,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { AuthUser } from '../common/auth';
import { RepositoryUnavailableError } from '../documents/documents.repository';
import type { AreasDirectory } from '../documents/ports/areas-directory';
import { ProcedureAreasService } from './procedure-areas.service';
import { ProceduresRepositoryUnavailableError } from './procedures.repository';
import type { ProceduresRepository } from './procedures.repository';

const ADMIN: AuthUser = {
  id: '0b000000-0000-4000-8000-000000000001',
  role: 'ADMIN',
};
const SUPERVISOR: AuthUser = {
  id: '0b000000-0000-4000-8000-000000000002',
  role: 'SUPERVISOR',
};
const EMPLOYEE: AuthUser = {
  id: '0b000000-0000-4000-8000-000000000003',
  role: 'EMPLOYEE',
};

const PROCEDURE_ID = '1a000000-0000-4000-8000-000000000001';
const VENTAS = '0a000000-0000-4000-8000-000000000001';
const OPERACIONES = '0a000000-0000-4000-8000-000000000002';
const MISSING_AREA = '0a000000-0000-4000-8000-000000000099';

describe('ProcedureAreasService', () => {
  let repository: { setAreas: jest.Mock };
  let areas: { findExistingIds: jest.Mock };
  let loggerError: jest.SpyInstance;
  let service: ProcedureAreasService;

  beforeEach(() => {
    repository = { setAreas: jest.fn() };
    areas = { findExistingIds: jest.fn() };
    loggerError = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => {});
    service = new ProcedureAreasService(
      repository as unknown as ProceduresRepository,
      areas as unknown as AreasDirectory,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('setAreas', () => {
    it.each([
      ['a SUPERVISOR', SUPERVISOR],
      ['an EMPLOYEE', EMPLOYEE],
    ])(
      'R1: %s gets 403 and nothing is asked or written',
      async (_who, user) => {
        await expect(
          service.setAreas(user, PROCEDURE_ID, [VENTAS]),
        ).rejects.toBeInstanceOf(ForbiddenException);

        expect(areas.findExistingIds).not.toHaveBeenCalled();
        expect(repository.setAreas).not.toHaveBeenCalled();
      },
    );

    it('R11: checks the areas with the directory and saves the set', async () => {
      areas.findExistingIds.mockResolvedValue([VENTAS, OPERACIONES]);
      repository.setAreas.mockResolvedValue([VENTAS, OPERACIONES]);

      await expect(
        service.setAreas(ADMIN, PROCEDURE_ID, [VENTAS, OPERACIONES]),
      ).resolves.toEqual([VENTAS, OPERACIONES]);

      expect(areas.findExistingIds).toHaveBeenCalledWith([VENTAS, OPERACIONES]);
      expect(repository.setAreas).toHaveBeenCalledWith(PROCEDURE_ID, [
        VENTAS,
        OPERACIONES,
      ]);
    });

    it('E18: an area that does not exist is 400 and nothing is saved', async () => {
      areas.findExistingIds.mockResolvedValue([VENTAS]);

      const error = await service
        .setAreas(ADMIN, PROCEDURE_ID, [VENTAS, MISSING_AREA])
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).message).toBe(
        'Alguna de las áreas no existe',
      );
      expect(repository.setAreas).not.toHaveBeenCalled();
    });

    it('R11: an empty set is valid: it does not ask the directory and clears the areas', async () => {
      repository.setAreas.mockResolvedValue([]);

      await expect(service.setAreas(ADMIN, PROCEDURE_ID, [])).resolves.toEqual(
        [],
      );

      expect(areas.findExistingIds).not.toHaveBeenCalled();
      expect(repository.setAreas).toHaveBeenCalledWith(PROCEDURE_ID, []);
    });

    it('is 404 when the procedure does not exist', async () => {
      areas.findExistingIds.mockResolvedValue([VENTAS]);
      repository.setAreas.mockResolvedValue(null);

      const error = await service
        .setAreas(ADMIN, PROCEDURE_ID, [VENTAS])
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(NotFoundException);
      expect((error as NotFoundException).message).toBe(
        'No se encontró el procedimiento',
      );
    });

    it('P19: with an area that does not exist the answer is 400 even if the procedure is missing too', async () => {
      areas.findExistingIds.mockResolvedValue([]);
      repository.setAreas.mockResolvedValue(null);

      await expect(
        service.setAreas(ADMIN, PROCEDURE_ID, [MISSING_AREA]),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('503 when the areas directory is down', async () => {
      areas.findExistingIds.mockRejectedValue(
        new RepositoryUnavailableError('directorio caído'),
      );

      await expect(
        service.setAreas(ADMIN, PROCEDURE_ID, [VENTAS]),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(repository.setAreas).not.toHaveBeenCalled();
    });

    it('503 when the repository is down', async () => {
      areas.findExistingIds.mockResolvedValue([VENTAS]);
      repository.setAreas.mockRejectedValue(
        new ProceduresRepositoryUnavailableError('base caída'),
      );

      await expect(
        service.setAreas(ADMIN, PROCEDURE_ID, [VENTAS]),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    });

    it('500 on an unexpected error, with the cause in the log and not in the response', async () => {
      areas.findExistingIds.mockResolvedValue([VENTAS]);
      repository.setAreas.mockRejectedValue(new Error('secret detail'));

      const error = await service
        .setAreas(ADMIN, PROCEDURE_ID, [VENTAS])
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(InternalServerErrorException);
      expect(JSON.stringify((error as Error).message)).not.toContain(
        'secret detail',
      );
      expect(loggerError).toHaveBeenCalledWith(
        expect.objectContaining({ cause: 'secret detail' }),
      );
    });
  });
});
