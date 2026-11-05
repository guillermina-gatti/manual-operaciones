import { describe, expect, test } from 'vitest';
import { ApiError, describeExecutionError, EXECUTION_MESSAGES } from '@/lib/api';
import type { ExecutionErrorContext } from '@/lib/api';

const CONTEXTS: ExecutionErrorContext[] = ['start', 'detail', 'complete'];

describe('errors shared by every context', () => {
  test.each(CONTEXTS)('%s: no connection can be retried', (context) => {
    expect(describeExecutionError(new ApiError(0), context)).toEqual({
      message: 'No pudimos conectarnos con el servidor. Revisá tu conexión y probá de nuevo.',
      canRetry: true,
      notFound: false,
    });
  });

  test.each(CONTEXTS)('%s: 503 can be retried', (context) => {
    expect(describeExecutionError(new ApiError(503), context)).toEqual({
      message: 'El servicio no está disponible. Probá de nuevo en unos minutos.',
      canRetry: true,
      notFound: false,
    });
  });

  test.each(CONTEXTS)('%s: 401 asks to sign in again', (context) => {
    const result = describeExecutionError(new ApiError(401), context);

    expect(result.message).toBe('Tu sesión no es válida. Volvé a ingresar.');
    expect(result.canRetry).toBe(false);
  });

  test.each(CONTEXTS)('%s: 403 says only employees execute procedures', (context) => {
    const result = describeExecutionError(new ApiError(403), context);

    expect(result.message).toBe(EXECUTION_MESSAGES.noPermission);
    expect(result.canRetry).toBe(false);
  });

  test.each(CONTEXTS)('%s: an unknown status is unexpected and can be retried', (context) => {
    expect(describeExecutionError(new ApiError(500), context)).toMatchObject({
      message: 'Ocurrió un error inesperado. Probá de nuevo.',
      canRetry: true,
    });
  });

  test.each(CONTEXTS)('%s: an error that is not an ApiError is unexpected', (context) => {
    expect(describeExecutionError(new Error('boom'), context)).toMatchObject({
      message: 'Ocurrió un error inesperado. Probá de nuevo.',
      canRetry: true,
    });
  });
});

describe('not found', () => {
  test.each([400, 404])('start: %i means the procedure is not available', (status) => {
    expect(describeExecutionError(new ApiError(status), 'start')).toEqual({
      message: EXECUTION_MESSAGES.procedureNotFound,
      canRetry: false,
      notFound: true,
    });
  });

  test.each(['detail', 'complete'] as const)('%s: 404 means the execution is not found', (context) => {
    expect(describeExecutionError(new ApiError(404), context)).toEqual({
      message: EXECUTION_MESSAGES.executionNotFound,
      canRetry: false,
      notFound: true,
    });
  });

  test.each(['detail', 'complete'] as const)('%s: 400 (bad id) looks the same as 404', (context) => {
    expect(describeExecutionError(new ApiError(400), context)).toEqual(
      describeExecutionError(new ApiError(404), context),
    );
  });
});

describe('409 when completing a step, by reason', () => {
  test.each([
    ['STEP_ALREADY_FINISHED', EXECUTION_MESSAGES.stepAlreadyFinished],
    ['STEP_OUT_OF_ORDER', EXECUTION_MESSAGES.stepOutOfOrder],
    ['EXECUTION_COMPLETED', EXECUTION_MESSAGES.executionCompleted],
    [undefined, EXECUTION_MESSAGES.executionChanged],
  ])('%s', (reason, message) => {
    expect(describeExecutionError(new ApiError(409, [], undefined, reason), 'complete')).toEqual({
      message,
      canRetry: false,
      notFound: false,
    });
  });
});

test('never shows the texts sent by the API', () => {
  const apiText = 'Step 1c000000-0000-4000-8000-000000000011 is not the current step';

  for (const status of [0, 400, 401, 403, 404, 409, 500, 503]) {
    for (const context of CONTEXTS) {
      const result = describeExecutionError(new ApiError(status, [apiText]), context);
      expect(result.message).not.toContain(apiText);
    }
  }
});
