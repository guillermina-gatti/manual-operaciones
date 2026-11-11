import {
  BadRequestException,
  ForbiddenException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { SPEC_USERS } from '../../test/executions/real-auth';
import { PROCEDURE_ID } from '../../test/procedures/version-fixtures';
import type { AuthUser } from '../common/auth';
import { ProcedureCompareService } from './procedure-compare.service';
import { ProceduresRepositoryUnavailableError } from './procedures.repository';
import type { CompareStep, CompareVersion } from './version-compare';
import type { VersionsRepository } from './versions.repository';

const ADMIN: AuthUser = SPEC_USERS.admin;
const SUPERVISOR: AuthUser = SPEC_USERS.supervisorVentas;
const EMPLOYEE: AuthUser = SPEC_USERS.empleadoVentas;
const FROM = '1b000000-0000-4000-8000-000000000001';
const TO = '1b000000-0000-4000-8000-000000000002';

const step = (key: string, order: number, title: string): CompareStep => ({
  key,
  id: `id-${key}-${order}`,
  order,
  title,
  description: '',
});

const version = (id: string, versionNumber: number, steps: CompareStep[]): CompareVersion => ({
  id,
  versionNumber,
  status: 'PUBLISHED',
  steps,
});

describe('ProcedureCompareService', () => {
  let versions: { findForCompare: jest.Mock };
  let service: ProcedureCompareService;

  beforeEach(() => {
    versions = { findForCompare: jest.fn() };
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    service = new ProcedureCompareService(versions as unknown as VersionsRepository);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('compare', () => {
    const compare = (user: AuthUser = ADMIN, from = FROM, to = TO) =>
      service.compare(user, PROCEDURE_ID, from, to);

    it.each([['SUPERVISOR', SUPERVISOR], ['EMPLOYEE', EMPLOYEE]])(
      'R1: %s gets 403 before anything is looked up',
      async (_role, user) => {
        await expect(compare(user)).rejects.toBeInstanceOf(ForbiddenException);
        expect(versions.findForCompare).not.toHaveBeenCalled();
      },
    );

    it('E14: the same version on both sides is a 400, and the repository is not asked', async () => {
      const error = await compare(ADMIN, FROM, FROM).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).message).toBe('Elegí dos versiones distintas para comparar');
      expect(versions.findForCompare).not.toHaveBeenCalled();
    });

    it('E16: a version that is not there, or is of another procedure, is a 404 with the usual message', async () => {
      versions.findForCompare.mockResolvedValue(null);

      const error = await compare().catch((e: unknown) => e);

      expect(error).toBeInstanceOf(NotFoundException);
      expect((error as NotFoundException).message).toBe('No se encontró el procedimiento');
    });

    it('asks for both versions inside that procedure', async () => {
      versions.findForCompare.mockResolvedValue({ from: version(FROM, 1, []), to: version(TO, 2, []) });

      await compare();

      expect(versions.findForCompare).toHaveBeenCalledWith(PROCEDURE_ID, FROM, TO);
    });

    it('E12: gives what the comparison finds between the two versions', async () => {
      versions.findForCompare.mockResolvedValue({
        from: version(FROM, 1, [step('a', 1, 'Contar'), step('c', 2, 'Cerrar')]),
        to: version(TO, 2, [step('a', 1, 'Contar'), step('d', 2, 'Guardar')]),
      });

      const result = await compare();

      expect(result.added.map((item) => item.title)).toEqual(['Guardar']);
      expect(result.removed.map((item) => item.title)).toEqual(['Cerrar']);
      expect(result.unchanged).toBe(1);
      expect(result.from).toMatchObject({ id: FROM, versionNumber: 1 });
    });

    it('a database that does not answer is a 503', async () => {
      versions.findForCompare.mockRejectedValue(new ProceduresRepositoryUnavailableError('caída'));

      await expect(compare()).rejects.toBeInstanceOf(ServiceUnavailableException);
    });
  });
});
