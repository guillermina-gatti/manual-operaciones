import {
  ConflictException,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { RepositoryUnavailableError } from '../documents/documents.repository';
import { ExecutionsRepositoryUnavailableError } from './executions.repository';
import { toHttpException } from './http-errors';
import type { ExecutionOperation } from './http-errors';
import { CatalogUnavailableError } from './ports/procedures-catalog';

// How each operation is named in the messages.
const PHRASES: [ExecutionOperation, string][] = [
  ['start', 'el inicio de la ejecución'],
  ['find', 'la consulta de la ejecución'],
  ['complete', 'el registro del paso'],
];

describe('toHttpException (executions)', () => {
  let logger: Logger;
  let loggerError: jest.SpyInstance;

  beforeEach(() => {
    logger = new Logger('Test');
    loggerError = jest.spyOn(logger, 'error').mockImplementation(() => {});
  });

  it('a 404 passes unchanged and without log', () => {
    const notFound = new NotFoundException('No se encontró la ejecución');

    expect(toHttpException(notFound, logger, 'find')).toBe(notFound);
    expect(loggerError).not.toHaveBeenCalled();
  });

  it('a 409 passes unchanged, keeping its reason', () => {
    const conflict = new ConflictException({
      statusCode: 409,
      message: 'Ese paso ya está terminado',
      error: 'Conflict',
      reason: 'STEP_ALREADY_FINISHED',
    });

    const result = toHttpException(conflict, logger, 'complete');

    expect(result).toBe(conflict);
    expect(result.getResponse()).toMatchObject({
      reason: 'STEP_ALREADY_FINISHED',
    });
    expect(loggerError).not.toHaveBeenCalled();
  });

  it.each([
    new ExecutionsRepositoryUnavailableError('base caída'),
    new CatalogUnavailableError('catálogo caído'),
    // UsersDirectory (Prisma) reports a down database with the documents error.
    new RepositoryUnavailableError('directorio caído'),
  ])('a dependency that is down (%s) is a 503', (cause) => {
    expect(toHttpException(cause, logger, 'start')).toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  describe.each(PHRASES)('operation "%s"', (operation, phrase) => {
    it(`503: "No se pudo completar ${phrase}. Intentá de nuevo más tarde."`, () => {
      const failure = toHttpException(
        new CatalogUnavailableError('catálogo caído'),
        logger,
        operation,
      );

      expect(failure).toBeInstanceOf(ServiceUnavailableException);
      expect(failure.message).toBe(
        `No se pudo completar ${phrase}. Intentá de nuevo más tarde.`,
      );
      expect(loggerError).toHaveBeenCalledWith({
        message: `${phrase[0].toUpperCase()}${phrase.slice(1)} falló por una dependencia no disponible`,
        cause: 'catálogo caído',
      });
    });

    it(`500: "No se pudo completar ${phrase}."`, () => {
      const failure = toHttpException(
        new Error('x is undefined'),
        logger,
        operation,
      );

      expect(failure).toBeInstanceOf(InternalServerErrorException);
      expect(failure.message).toBe(`No se pudo completar ${phrase}.`);
      expect(loggerError).toHaveBeenCalledWith({
        message: `${phrase[0].toUpperCase()}${phrase.slice(1)} falló por un error inesperado`,
        cause: 'x is undefined',
      });
    });
  });

  it('the cause goes to the log, never to the response', () => {
    const failure = toHttpException(
      new ExecutionsRepositoryUnavailableError('password=secret'),
      logger,
      'find',
    );

    expect(JSON.stringify(failure.getResponse())).not.toContain('secret');
  });
});
