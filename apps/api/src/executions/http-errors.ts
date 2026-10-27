/* Maps errors of the executions use cases to HTTP, like documents/http-errors.ts */
import {
  HttpException,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { RepositoryUnavailableError } from '../documents/documents.repository';
import { errorMessage } from '../documents/http-errors';
import { ExecutionsRepositoryUnavailableError } from './executions.repository';
import { CatalogUnavailableError } from './ports/procedures-catalog';

export type ExecutionOperation = 'start' | 'find' | 'complete';

// How each operation is named in the messages, with its article.
const PHRASES: Record<ExecutionOperation, string> = {
  start: 'el inicio de la ejecución',
  find: 'la consulta de la ejecución',
  complete: 'el registro del paso',
};

const capitalize = (text: string) => text[0].toUpperCase() + text.slice(1);

// Business rules are already HttpExceptions (404, 409 with reason) and pass as they
// are. A dependency that is down (database, catalog or the users directory, which
// reports with the documents error) is a 503; anything else is a 500. In both cases
// the cause goes to the log, never to the response.
export function toHttpException(
  error: unknown,
  logger: Logger,
  operation: ExecutionOperation,
): HttpException {
  if (error instanceof HttpException) return error;
  const phrase = PHRASES[operation];
  if (
    error instanceof ExecutionsRepositoryUnavailableError ||
    error instanceof CatalogUnavailableError ||
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
