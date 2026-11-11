import { describe, expect, test } from 'vitest';
import { ApiError } from '@/lib/api';
import { PROCEDURE_MESSAGES, describeProcedureError } from '@/lib/api/procedure-errors';

const conflict = (reason: string) => new ApiError(409, [], undefined, reason);

describe('describeProcedureError: versions (spec 015)', () => {
  test.each([
    ['VERSION_NOT_DRAFT', PROCEDURE_MESSAGES.versionNotDraft],
    ['NO_STEPS', PROCEDURE_MESSAGES.noSteps],
    ['NO_AREAS', PROCEDURE_MESSAGES.noAreas],
    ['DRAFT_ALREADY_EXISTS', PROCEDURE_MESSAGES.draftAlreadyExists],
  ])('409 %s says what happened, with voseo', (reason, message) => {
    expect(describeProcedureError(conflict(reason), 'publish').message).toBe(message);
  });

  test('the messages tell what to do', () => {
    expect(PROCEDURE_MESSAGES.noSteps).toBe('La versión no tiene pasos. Agregá al menos uno para publicarla.');
    expect(PROCEDURE_MESSAGES.noAreas).toBe(
      'El procedimiento no tiene áreas. Asignale al menos una para publicarlo.',
    );
  });

  test('a 400 while publishing asks to check the data', () => {
    expect(describeProcedureError(new ApiError(400), 'publish').canRetry).toBe(false);
  });

  test('a 404 in the versions says it is not there, and a 503 can be retried', () => {
    expect(describeProcedureError(new ApiError(404), 'versions').notFound).toBe(true);
    expect(describeProcedureError(new ApiError(503), 'versions').canRetry).toBe(true);
  });

  test('a reason that is not known still says the procedure changed', () => {
    expect(describeProcedureError(conflict('OTRA'), 'publish').message).toBe(PROCEDURE_MESSAGES.changed);
  });
});
