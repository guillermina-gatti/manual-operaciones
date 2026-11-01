import { describe, expect, test } from 'vitest';
import { ApiError } from '@/lib/api';
import { MESSAGES } from '@/lib/api/error-messages';
import { PROCEDURE_MESSAGES, describeProcedureError } from '@/lib/api/procedure-errors';
import type { ProcedureErrorContext } from '@/lib/api/procedure-errors';

const CONTEXTS: ProcedureErrorContext[] = ['create', 'draft', 'discard', 'step', 'reorder', 'areas'];

describe('describeProcedureError', () => {
  test('an error that is not an ApiError is unexpected, and can be retried', () => {
    expect(describeProcedureError(new Error('boom'), 'create')).toEqual({
      message: MESSAGES.unexpected,
      canRetry: true,
      notFound: false,
    });
  });

  test.each(CONTEXTS)('0 → no connection, with retry (%s)', (context) => {
    expect(describeProcedureError(new ApiError(0), context)).toEqual({
      message: MESSAGES.noConnection,
      canRetry: true,
      notFound: false,
    });
  });

  describe('400', () => {
    test.each(['create', 'draft', 'step'] as const)('in a form it asks to check the data (%s)', (context) => {
      expect(describeProcedureError(new ApiError(400, ['title must be shorter']), context).message).toBe(
        MESSAGES.checkForm,
      );
    });

    test('in the areas it says some area cannot be assigned, without the text of the API', () => {
      const { message, canRetry } = describeProcedureError(
        new ApiError(400, ['Alguna de las áreas está inactiva']),
        'areas',
      );

      expect(message).toBe(PROCEDURE_MESSAGES.areaNotAssignable);
      expect(message).not.toContain('inactiva y');
      expect(canRetry).toBe(false);
    });

    test('in the order it says the steps changed', () => {
      expect(describeProcedureError(new ApiError(400), 'reorder').message).toBe(
        PROCEDURE_MESSAGES.stepsChanged,
      );
    });
  });

  test.each(CONTEXTS)('401 → the session is not valid (%s)', (context) => {
    expect(describeProcedureError(new ApiError(401), context)).toEqual({
      message: MESSAGES.sessionInvalid,
      canRetry: false,
      notFound: false,
    });
  });

  test.each(CONTEXTS)('403 → only an administrator can change procedures (%s)', (context) => {
    expect(describeProcedureError(new ApiError(403), context)).toEqual({
      message: PROCEDURE_MESSAGES.noPermission,
      canRetry: false,
      notFound: false,
    });
  });

  test.each(CONTEXTS)('404 → one message for the procedure, the version and the step (%s)', (context) => {
    expect(describeProcedureError(new ApiError(404), context)).toEqual({
      message: PROCEDURE_MESSAGES.notFound,
      canRetry: false,
      notFound: true,
    });
  });

  describe('409', () => {
    test('VERSION_NOT_EDITABLE → the version is no longer a draft', () => {
      expect(
        describeProcedureError(new ApiError(409, [], undefined, 'VERSION_NOT_EDITABLE'), 'step').message,
      ).toBe(PROCEDURE_MESSAGES.versionNotEditable);
    });

    test('STEP_LIMIT_REACHED → the draft has 50 steps', () => {
      expect(
        describeProcedureError(new ApiError(409, [], undefined, 'STEP_LIMIT_REACHED'), 'step').message,
      ).toBe(PROCEDURE_MESSAGES.stepLimit);
    });

    test('another reason, or none → the procedure changed', () => {
      expect(describeProcedureError(new ApiError(409), 'draft').message).toBe(PROCEDURE_MESSAGES.changed);
      expect(
        describeProcedureError(new ApiError(409, [], undefined, 'OTRA'), 'draft').message,
      ).toBe(PROCEDURE_MESSAGES.changed);
    });
  });

  test.each(CONTEXTS)('503 → unavailable, with retry (%s)', (context) => {
    expect(describeProcedureError(new ApiError(503), context)).toEqual({
      message: MESSAGES.unavailable,
      canRetry: true,
      notFound: false,
    });
  });

  test('any other status is unexpected, with retry', () => {
    expect(describeProcedureError(new ApiError(500), 'create')).toEqual({
      message: MESSAGES.unexpected,
      canRetry: true,
      notFound: false,
    });
  });

  test('the texts sent by the API are never shown', () => {
    for (const status of [400, 403, 404, 409, 503]) {
      const { message } = describeProcedureError(new ApiError(status, ['texto interno de la API']), 'step');
      expect(message).not.toContain('texto interno');
    }
  });
});
