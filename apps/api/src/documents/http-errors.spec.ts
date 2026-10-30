import {
  ConflictException,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { StorageUnavailableError } from '../storage/file-storage';
import { RepositoryUnavailableError } from './documents.repository';
import { toHttpException } from './http-errors';
import type { HttpOperation } from './http-errors';
import { QueueUnavailableError } from './ports/processing-queue';

// Cómo se nombra cada operación en los mensajes. Las de la spec 001 no cambian.
const PHRASES: [HttpOperation, string][] = [
  ['carga', 'la carga'],
  ['consulta', 'la consulta'],
  ['cambio de áreas', 'el cambio de áreas'],
  ['versión nueva', 'la carga de la versión nueva'],
  ['archivo', 'el archivado del documento'],
  ['búsqueda', 'la búsqueda'], // spec 004
  ['revisión', 'el registro de la revisión'], // spec 005
];

describe('toHttpException', () => {
  let logger: Logger;
  let loggerError: jest.SpyInstance;

  beforeEach(() => {
    logger = new Logger('Test');
    loggerError = jest.spyOn(logger, 'error').mockImplementation(() => {});
  });

  it('una HttpException pasa sin cambios y sin log', () => {
    const conflict = new ConflictException('ya existe');

    expect(toHttpException(conflict, logger, 'archivo')).toBe(conflict);
    expect(loggerError).not.toHaveBeenCalled();
  });

  it.each([
    new StorageUnavailableError('S3 caído'),
    new QueueUnavailableError('cola caída'),
    new RepositoryUnavailableError('base caída'),
  ])('una dependencia caída (%s) es 503', (cause) => {
    expect(toHttpException(cause, logger, 'cambio de áreas')).toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  describe.each(PHRASES)('operación "%s"', (operation, phrase) => {
    it(`503: "No se pudo completar ${phrase}. Intentá de nuevo más tarde."`, () => {
      const failure = toHttpException(
        new RepositoryUnavailableError('base caída'),
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
      const failure = toHttpException(new Error('x is undefined'), logger, operation);

      expect(failure).toBeInstanceOf(InternalServerErrorException);
      expect(failure.message).toBe(`No se pudo completar ${phrase}.`);
      expect(loggerError).toHaveBeenCalledWith({
        message: `${phrase[0].toUpperCase()}${phrase.slice(1)} falló por un error inesperado`,
        cause: 'x is undefined',
      });
    });
  });

  it('los textos de la carga y la consulta (spec 001) quedan exactamente iguales', () => {
    const cause = new RepositoryUnavailableError('base caída');

    expect(toHttpException(cause, logger, 'carga').message).toBe(
      'No se pudo completar la carga. Intentá de nuevo más tarde.',
    );
    expect(toHttpException(new Error('x'), logger, 'consulta').message).toBe(
      'No se pudo completar la consulta.',
    );
    expect(loggerError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'La carga falló por una dependencia no disponible',
      }),
    );
  });
});
