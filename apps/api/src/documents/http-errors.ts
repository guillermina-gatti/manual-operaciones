/* Manejador y traductor de excepciones HTTP*/
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

// Las operaciones que mapean errores: carga y consulta (spec 001), las del ciclo de vida (spec 003)
// y la búsqueda (spec 004).
export type HttpOperation =
  | 'carga'
  | 'consulta'
  | 'cambio de áreas'
  | 'versión nueva'
  | 'archivo'
  | 'búsqueda';

// Cómo se nombra cada una en los mensajes, con su artículo ("la carga", "el cambio de áreas").
// "archivo" se nombra "el archivado del documento" para no confundirlo con el archivo subido.
const PHRASES: Record<HttpOperation, string> = {
  carga: 'la carga',
  consulta: 'la consulta',
  'cambio de áreas': 'el cambio de áreas',
  'versión nueva': 'la carga de la versión nueva',
  archivo: 'el archivado del documento',
  búsqueda: 'la búsqueda',
};

const capitalize = (text: string) => text[0].toUpperCase() + text.slice(1);

// Plan 4, "Mapeo de errores" (D13): las reglas de negocio ya son HttpException; una dependencia caída
// (almacenamiento, cola, base o directorios) es 503; cualquier otro error es inesperado y es 500.
// En los dos últimos casos la causa va al log y no a la respuesta.
export function toHttpException(
  error: unknown,
  logger: Logger,
  operation: HttpOperation,
): HttpException {
  if (error instanceof HttpException) return error;
  const phrase = PHRASES[operation];
  if (
    error instanceof StorageUnavailableError ||
    error instanceof QueueUnavailableError ||
    error instanceof RepositoryUnavailableError
  ) {
    logger.error({
      message: `${capitalize(phrase)} falló por una dependencia no disponible`,
      cause: errorMessage(error),
    });
    return new ServiceUnavailableException(
      `No se pudo completar ${phrase}. Intentá de nuevo más tarde.`,
    );
  }
  logger.error({
    message: `${capitalize(phrase)} falló por un error inesperado`,
    cause: errorMessage(error),
  });
  return new InternalServerErrorException(`No se pudo completar ${phrase}.`);
}
