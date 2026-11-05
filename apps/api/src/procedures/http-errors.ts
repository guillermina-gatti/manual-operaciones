/* Maps errors of the procedures use cases to HTTP, like executions/http-errors.ts */
import {
  HttpException,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { errorMessage } from '../documents/http-errors';
import { ProceduresRepositoryUnavailableError } from './procedures.repository';

export type ProcedureOperation =
  | 'create'
  | 'createDraft'
  | 'update'
  | 'remove'
  | 'addStep'
  | 'updateStep'
  | 'removeStep'
  | 'reorderSteps';

// How each operation is named in the messages, with its article.
const PHRASES: Record<ProcedureOperation, string> = {
  create: 'la creación del procedimiento',
  createDraft: 'la creación del borrador',
  update: 'la edición del borrador',
  remove: 'el borrado del borrador',
  addStep: 'el alta del paso',
  updateStep: 'la edición del paso',
  removeStep: 'el borrado del paso',
  reorderSteps: 'el reordenamiento de los pasos',
};

const capitalize = (text: string) => text[0].toUpperCase() + text.slice(1);

// Business rules are already HttpExceptions (400, 403, 404, 409 with reason) and pass as they
// are. A database that is down is a 503; anything else is a 500. In both cases the cause goes
// to the log, never to the response.
export function toHttpException(
  error: unknown,
  logger: Logger,
  operation: ProcedureOperation,
): HttpException {
  if (error instanceof HttpException) return error;
  const phrase = PHRASES[operation];
  if (error instanceof ProceduresRepositoryUnavailableError) {
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
