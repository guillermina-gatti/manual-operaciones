import {
  HttpException,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { StorageUnavailableError } from '../storage/file-storage';
import { RepositoryUnavailableError } from './documents.repository';
import { QueueUnavailableError } from './ports/processing-queue';

export const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

// Plan 4, "Mapeo de errores" (D13): las reglas de negocio ya son HttpException; una dependencia caída
// (almacenamiento, cola, base o directorios) es 503; cualquier otro error es inesperado y es 500.
// En los dos últimos casos la causa va al log y no a la respuesta.
export function toHttpException(
  error: unknown,
  logger: Logger,
  operation: 'carga' | 'consulta',
): HttpException {
  if (error instanceof HttpException) return error;
  if (
    error instanceof StorageUnavailableError ||
    error instanceof QueueUnavailableError ||
    error instanceof RepositoryUnavailableError
  ) {
    logger.error({
      message: `La ${operation} falló por una dependencia no disponible`,
      cause: errorMessage(error),
    });
    return new ServiceUnavailableException(
      `No se pudo completar la ${operation}. Intentá de nuevo más tarde.`,
    );
  }
  logger.error({
    message: `La ${operation} falló por un error inesperado`,
    cause: errorMessage(error),
  });
  return new InternalServerErrorException(
    `No se pudo completar la ${operation}.`,
  );
}
