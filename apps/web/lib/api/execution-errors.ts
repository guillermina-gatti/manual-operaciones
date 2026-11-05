// Turns API errors from /api/executions into messages for the user (spec 005).
// Like describeApiError, the texts sent by the API are never shown.
import { ApiError } from './api-error';
import { MESSAGES } from './error-messages';

// 'start': choosing a procedure. 'detail': loading the execution. 'complete': finishing a step.
export type ExecutionErrorContext = 'start' | 'detail' | 'complete';

export interface ExecutionErrorDescription {
  message: string;
  // Whether it makes sense to offer "Reintentar".
  canRetry: boolean;
  // The procedure or the execution is not there for this user (missing, foreign or another
  // area: the API answers the same 404 for all of them).
  notFound: boolean;
}

export const EXECUTION_MESSAGES = {
  noPermission: 'Solo los empleados pueden ejecutar procedimientos.',
  procedureNotFound: 'No encontramos ese procedimiento para tu área.',
  executionNotFound: 'No se encontró la ejecución.',
  stepAlreadyFinished: 'Ese paso ya estaba terminado.',
  stepOutOfOrder: 'Ese no es el paso actual.',
  executionCompleted: 'La ejecución ya estaba completa.',
  executionChanged: 'La ejecución cambió. Revisá el paso actual.',
} as const;

export function describeExecutionError(
  error: unknown,
  context: ExecutionErrorContext,
): ExecutionErrorDescription {
  if (!(error instanceof ApiError)) return describe(MESSAGES.unexpected, true);

  switch (error.status) {
    case 0:
      return describe(MESSAGES.noConnection, true);
    // A 400 is an id that is not a UUID: for the user, it does not exist.
    case 400:
    case 404:
      return {
        ...describe(
          context === 'start'
            ? EXECUTION_MESSAGES.procedureNotFound
            : EXECUTION_MESSAGES.executionNotFound,
          false,
        ),
        notFound: true,
      };
    case 401:
      return describe(MESSAGES.sessionInvalid, false);
    case 403:
      return describe(EXECUTION_MESSAGES.noPermission, false);
    case 409:
      return describe(conflictMessage(error.reason), false);
    case 503:
      return describe(MESSAGES.unavailable, true);
    default:
      return describe(MESSAGES.unexpected, true);
  }
}

function describe(message: string, canRetry: boolean): ExecutionErrorDescription {
  return { message, canRetry, notFound: false };
}

function conflictMessage(reason: string | undefined): string {
  switch (reason) {
    case 'STEP_ALREADY_FINISHED':
      return EXECUTION_MESSAGES.stepAlreadyFinished;
    case 'STEP_OUT_OF_ORDER':
      return EXECUTION_MESSAGES.stepOutOfOrder;
    case 'EXECUTION_COMPLETED':
      return EXECUTION_MESSAGES.executionCompleted;
    default:
      return EXECUTION_MESSAGES.executionChanged;
  }
}
