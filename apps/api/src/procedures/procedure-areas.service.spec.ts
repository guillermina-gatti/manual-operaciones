import {
  BadRequestException,
  ForbiddenException,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { SPEC_USERS } from '../../test/executions/real-auth';
import type { AuthUser } from '../common/auth';
import type { ProcedureAreasCatalog } from './procedure-areas.catalog';
import { ProcedureAreasService } from './procedure-areas.service';
import { ProceduresRepositoryUnavailableError } from './procedures.repository';
import type {
  ProcedureRecord,
  ProceduresRepository,
} from './procedures.repository';

// As the real guard leaves them in request.user (id, email, name, role and areas).
const ADMIN: AuthUser = SPEC_USERS.admin;
const SUPERVISOR: AuthUser = SPEC_USERS.supervisorVentas;
const EMPLOYEE: AuthUser = SPEC_USERS.empleadoVentas;

const PROCEDURE_ID = '1a000000-0000-4000-8000-000000000001';
const VENTAS = '0a000000-0000-4000-8000-000000000001';
const OPERACIONES = '0a000000-0000-4000-8000-000000000002';
const INACTIVA = '0a000000-0000-4000-8000-000000000003';
const OTRA_INACTIVA = '0a000000-0000-4000-8000-000000000004';
const MISSING_AREA = '0a000000-0000-4000-8000-000000000099';

const active = (id: string) => ({ id, isActive: true });
const inactive = (id: string) => ({ id, isActive: false });
const procedureWith = (areaIds: string[]) => ({ areaIds }) as ProcedureRecord;

describe('ProcedureAreasService', () => {
  let repository: { setAreas: jest.Mock; findById: jest.Mock };
  let areas: { findStates: jest.Mock };
  let loggerError: jest.SpyInstance;
  let service: ProcedureAreasService;

  beforeEach(() => {
    repository = { setAreas: jest.fn(), findById: jest.fn() };
    areas = { findStates: jest.fn() };
    loggerError = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => {});
    service = new ProcedureAreasService(
      repository as unknown as ProceduresRepository,
      areas as unknown as ProcedureAreasCatalog,
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

        expect(areas.findStates).not.toHaveBeenCalled();
        expect(repository.setAreas).not.toHaveBeenCalled();
      },
    );

    it('R11: with active areas it saves the set without reading the procedure', async () => {
      areas.findStates.mockResolvedValue([active(VENTAS), active(OPERACIONES)]);
      repository.setAreas.mockResolvedValue([VENTAS, OPERACIONES]);

      await expect(
        service.setAreas(ADMIN, PROCEDURE_ID, [VENTAS, OPERACIONES]),
      ).resolves.toEqual([VENTAS, OPERACIONES]);

      expect(areas.findStates).toHaveBeenCalledWith([VENTAS, OPERACIONES]);
      expect(repository.findById).not.toHaveBeenCalled();
      expect(repository.setAreas).toHaveBeenCalledWith(PROCEDURE_ID, [
        VENTAS,
        OPERACIONES,
      ]);
    });

    it('E18: an area that does not exist is 400 and nothing is saved', async () => {
      areas.findStates.mockResolvedValue([active(VENTAS)]);

      const error = await service
        .setAreas(ADMIN, PROCEDURE_ID, [VENTAS, MISSING_AREA])
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).message).toBe(
        'Alguna de las áreas no existe',
      );
      expect(repository.setAreas).not.toHaveBeenCalled();
    });

    it('E35: a new inactive area is 400 and nothing is saved', async () => {
      areas.findStates.mockResolvedValue([active(VENTAS), inactive(INACTIVA)]);
      repository.findById.mockResolvedValue(procedureWith([VENTAS]));

      const error = await service
        .setAreas(ADMIN, PROCEDURE_ID, [VENTAS, INACTIVA])
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).message).toBe(
        'Alguna de las áreas está inactiva',
      );
      expect(repository.setAreas).not.toHaveBeenCalled();
    });

    it('E36: an inactive area the procedure already had is kept', async () => {
      areas.findStates.mockResolvedValue([
        active(VENTAS),
        inactive(INACTIVA),
        active(OPERACIONES),
      ]);
      repository.findById.mockResolvedValue(procedureWith([VENTAS, INACTIVA]));
      repository.setAreas.mockResolvedValue([VENTAS, INACTIVA, OPERACIONES]);

      await expect(
        service.setAreas(ADMIN, PROCEDURE_ID, [VENTAS, INACTIVA, OPERACIONES]),
      ).resolves.toEqual([VENTAS, INACTIVA, OPERACIONES]);
      expect(repository.setAreas).toHaveBeenCalledWith(PROCEDURE_ID, [
        VENTAS,
        INACTIVA,
        OPERACIONES,
      ]);
    });

    it('E36: keeping one inactive area and adding another inactive one is 400', async () => {
      areas.findStates.mockResolvedValue([
        inactive(INACTIVA),
        inactive(OTRA_INACTIVA),
      ]);
      repository.findById.mockResolvedValue(procedureWith([INACTIVA]));

      await expect(
        service.setAreas(ADMIN, PROCEDURE_ID, [INACTIVA, OTRA_INACTIVA]),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(repository.setAreas).not.toHaveBeenCalled();
    });

    it('E37: removing the inactive area does not need to read the procedure', async () => {
      areas.findStates.mockResolvedValue([active(VENTAS)]);
      repository.setAreas.mockResolvedValue([VENTAS]);

      await expect(
        service.setAreas(ADMIN, PROCEDURE_ID, [VENTAS]),
      ).resolves.toEqual([VENTAS]);
      expect(repository.findById).not.toHaveBeenCalled();
    });

    it('E38: an inactive area for a procedure that does not exist is 400 and not 404', async () => {
      areas.findStates.mockResolvedValue([inactive(INACTIVA)]);
      repository.findById.mockResolvedValue(null);

      await expect(
        service.setAreas(ADMIN, PROCEDURE_ID, [INACTIVA]),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(repository.setAreas).not.toHaveBeenCalled();
    });

    it('E38: with one area missing and another inactive the message says it does not exist', async () => {
      areas.findStates.mockResolvedValue([inactive(INACTIVA)]);

      const error = await service
        .setAreas(ADMIN, PROCEDURE_ID, [INACTIVA, MISSING_AREA])
        .catch((e: unknown) => e);

      expect((error as BadRequestException).message).toBe(
        'Alguna de las áreas no existe',
      );
    });

    it('R11: an empty set is valid: it asks nobody and clears the areas', async () => {
      repository.setAreas.mockResolvedValue([]);

      await expect(service.setAreas(ADMIN, PROCEDURE_ID, [])).resolves.toEqual(
        [],
      );

      expect(areas.findStates).not.toHaveBeenCalled();
      expect(repository.setAreas).toHaveBeenCalledWith(PROCEDURE_ID, []);
    });

    it('is 404 when the procedure does not exist and the areas are fine', async () => {
      areas.findStates.mockResolvedValue([active(VENTAS)]);
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
      areas.findStates.mockResolvedValue([]);
      repository.setAreas.mockResolvedValue(null);

      await expect(
        service.setAreas(ADMIN, PROCEDURE_ID, [MISSING_AREA]),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('503 when the areas catalog is down', async () => {
      areas.findStates.mockRejectedValue(
        new ProceduresRepositoryUnavailableError('catálogo caído'),
      );

      await expect(
        service.setAreas(ADMIN, PROCEDURE_ID, [VENTAS]),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(repository.setAreas).not.toHaveBeenCalled();
    });

    it('503 when the procedure cannot be read to compare its areas', async () => {
      areas.findStates.mockResolvedValue([inactive(INACTIVA)]);
      repository.findById.mockRejectedValue(
        new ProceduresRepositoryUnavailableError('base caída'),
      );

      await expect(
        service.setAreas(ADMIN, PROCEDURE_ID, [INACTIVA]),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    });

    it('503 when the repository is down', async () => {
      areas.findStates.mockResolvedValue([active(VENTAS)]);
      repository.setAreas.mockRejectedValue(
        new ProceduresRepositoryUnavailableError('base caída'),
      );

      await expect(
        service.setAreas(ADMIN, PROCEDURE_ID, [VENTAS]),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    });

    it('500 on an unexpected error, with the cause in the log and not in the response', async () => {
      areas.findStates.mockResolvedValue([active(VENTAS)]);
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
