import {
  ConflictException,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { toHttpException } from './http-errors';
import type { ProcedureOperation } from './http-errors';
import { ProceduresRepositoryUnavailableError } from './procedures.repository';

// How each operation is named in the messages.
const PHRASES: [ProcedureOperation, string][] = [
  ['create', 'la creación del procedimiento'],
  ['createDraft', 'la creación del borrador'],
  ['update', 'la edición del borrador'],
  ['remove', 'el borrado del borrador'],
  ['addStep', 'el alta del paso'],
  ['updateStep', 'la edición del paso'],
  ['removeStep', 'el borrado del paso'],
  ['reorderSteps', 'el reordenamiento de los pasos'],
];

describe('toHttpException (procedures)', () => {
  let logger: Logger;
  let loggerError: jest.SpyInstance;

  beforeEach(() => {
    logger = new Logger('Test');
    loggerError = jest.spyOn(logger, 'error').mockImplementation(() => {});
  });

  it('a 404 passes unchanged and without log', () => {
    const notFound = new NotFoundException('No se encontró el procedimiento');

    expect(toHttpException(notFound, logger, 'update')).toBe(notFound);
    expect(loggerError).not.toHaveBeenCalled();
  });

  it('a 409 passes unchanged, keeping its reason', () => {
    const conflict = new ConflictException({
      statusCode: 409,
      message: 'La versión no se puede modificar',
      error: 'Conflict',
      reason: 'VERSION_NOT_EDITABLE',
    });

    const result = toHttpException(conflict, logger, 'remove');

    expect(result).toBe(conflict);
    expect(result.getResponse()).toMatchObject({
      reason: 'VERSION_NOT_EDITABLE',
    });
    expect(loggerError).not.toHaveBeenCalled();
  });

  describe.each(PHRASES)('operation "%s"', (operation, phrase) => {
    it(`503: "No se pudo completar ${phrase}. Intentá de nuevo más tarde."`, () => {
      const failure = toHttpException(
        new ProceduresRepositoryUnavailableError('base caída'),
        logger,
        operation,
      );

      expect(failure).toBeInstanceOf(ServiceUnavailableException);
      expect(failure.message).toBe(
        `No se pudo completar ${phrase}. Intentá de nuevo más tarde.`,
      );
      expect(loggerError).toHaveBeenCalledWith({
        message: `${phrase[0].toUpperCase()}${phrase.slice(1)} falló por una dependencia no disponible`,
        cause: 'base caída',
      });
    });

    it(`500: "No se pudo completar ${phrase}."`, () => {
      const failure = toHttpException(new Error('boom'), logger, operation);

      expect(failure).toBeInstanceOf(InternalServerErrorException);
      expect(failure.message).toBe(`No se pudo completar ${phrase}.`);
      expect(loggerError).toHaveBeenCalledWith({
        message: `${phrase[0].toUpperCase()}${phrase.slice(1)} falló por un error inesperado`,
        cause: 'boom',
      });
    });
  });

  it('the cause is logged but never reaches the response', () => {
    const secret = 'password authentication failed for user "manual"';

    const unavailable = toHttpException(
      new ProceduresRepositoryUnavailableError(secret),
      logger,
      'create',
    );
    const unexpected = toHttpException(new Error(secret), logger, 'create');

    expect(JSON.stringify(unavailable.getResponse())).not.toContain(secret);
    expect(JSON.stringify(unexpected.getResponse())).not.toContain(secret);
    expect(loggerError).toHaveBeenCalledTimes(2);
  });
});
