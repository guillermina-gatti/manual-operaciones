// Turns API errors from /api/procedures into messages for the user (spec 006).
// Like describeApiError, the texts sent by the API are never shown.
import { ApiError } from './api-error';
import { MESSAGES } from './error-messages';

// 'create': the new procedure. 'draft': title and description of the draft. 'discard': deleting the
// draft. 'step': adding, editing or deleting a step. 'reorder': moving a step. 'areas': the areas.
// 'publish' and 'versions': publishing a draft and reading or creating versions (spec 015).
export type ProcedureErrorContext =
  | 'create'
  | 'draft'
  | 'discard'
  | 'step'
  | 'reorder'
  | 'areas'
  | 'publish'
  | 'versions';

export interface ProcedureErrorDescription {
  message: string;
  // Whether it makes sense to offer "Reintentar".
  canRetry: boolean;
  // The procedure, the version or the step is not there (the API answers the same 404 for all).
  notFound: boolean;
}

export const PROCEDURE_MESSAGES = {
  areaNotAssignable:
    'Alguna de las áreas no se puede asignar: no existe, o está inactiva y el procedimiento no la tenía.',
  stepsChanged: 'Los pasos cambiaron. Volvé a intentar.',
  noPermission: 'Solo un administrador puede modificar procedimientos.',
  notFound: 'No se encontró el procedimiento, la versión o el paso.',
  versionNotEditable: 'Esa versión ya no es un borrador y no se puede modificar.',
  stepLimit: 'El borrador ya tiene 50 pasos.',
  changed: 'El procedimiento cambió. Volvé a intentar.',
  versionNotDraft: 'Esa versión ya no es un borrador, así que no se puede publicar.',
  noSteps: 'La versión no tiene pasos. Agregá al menos uno para publicarla.',
  noAreas: 'El procedimiento no tiene áreas. Asignale al menos una para publicarlo.',
  draftAlreadyExists: 'El procedimiento ya tiene un borrador abierto.',
} as const;

export function describeProcedureError(
  error: unknown,
  context: ProcedureErrorContext,
): ProcedureErrorDescription {
  if (!(error instanceof ApiError)) return describe(MESSAGES.unexpected, true);

  switch (error.status) {
    case 0:
      return describe(MESSAGES.noConnection, true);
    case 400:
      return describe(badRequestMessage(context), false);
    case 401:
      return describe(MESSAGES.sessionInvalid, false);
    case 403:
      return describe(PROCEDURE_MESSAGES.noPermission, false);
    case 404:
      return { ...describe(PROCEDURE_MESSAGES.notFound, false), notFound: true };
    case 409:
      return describe(conflictMessage(error.reason), false);
    case 503:
      return describe(MESSAGES.unavailable, true);
    default:
      return describe(MESSAGES.unexpected, true);
  }
}

function describe(message: string, canRetry: boolean): ProcedureErrorDescription {
  return { message, canRetry, notFound: false };
}

function badRequestMessage(context: ProcedureErrorContext): string {
  if (context === 'areas') return PROCEDURE_MESSAGES.areaNotAssignable;
  if (context === 'reorder') return PROCEDURE_MESSAGES.stepsChanged;
  return MESSAGES.checkForm;
}

function conflictMessage(reason: string | undefined): string {
  switch (reason) {
    case 'VERSION_NOT_EDITABLE':
      return PROCEDURE_MESSAGES.versionNotEditable;
    case 'STEP_LIMIT_REACHED':
      return PROCEDURE_MESSAGES.stepLimit;
    case 'VERSION_NOT_DRAFT':
      return PROCEDURE_MESSAGES.versionNotDraft;
    case 'NO_STEPS':
      return PROCEDURE_MESSAGES.noSteps;
    case 'NO_AREAS':
      return PROCEDURE_MESSAGES.noAreas;
    case 'DRAFT_ALREADY_EXISTS':
      return PROCEDURE_MESSAGES.draftAlreadyExists;
    default:
      return PROCEDURE_MESSAGES.changed;
  }
}
