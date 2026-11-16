/* Registro sanitizado de eventos y errores de BullMQ (M2-B.5).
   Nunca imprime URLs con credenciales, contraseñas, tokens ni contenido documental. */

const SAFE_BULLMQ_ERROR_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EAI_AGAIN',
  'NR_CLOSED',
  'CONNECTION_BROKEN',
  'UNCERTAIN_STATE',
  'EPIPE',
]);

export interface RuntimeLogger {
  warn(payload: Record<string, unknown>): void;
  error(payload: Record<string, unknown>): void;
}

export interface ListenableQueue {
  on(event: 'error', listener: (error: Error) => void): unknown;
}

export interface ListenableWorker {
  on(
    event: 'failed',
    listener: (
      job: { data?: { documentVersionId?: string }; attemptsMade?: number } | undefined,
      error: Error,
    ) => void,
  ): unknown;
  on(event: 'error', listener: (error: Error) => void): unknown;
  on(event: 'stalled', listener: (jobId: string) => void): unknown;
}

export function sanitizeBullMqError(error: unknown): {
  errorType: string;
  errorCode: string;
} {
  const errorType = error instanceof Error ? error.name : 'UnknownError';
  const rawCode = (error as { code?: unknown } | null)?.code;
  const errorCode =
    typeof rawCode === 'string' && SAFE_BULLMQ_ERROR_CODES.has(rawCode)
      ? rawCode
      : 'BULLMQ_ERROR';
  return { errorType, errorCode };
}

export function attachQueueListeners(
  queue: ListenableQueue,
  logger: RuntimeLogger,
): void {
  queue.on('error', (error: Error) => {
    logger.error({
      component: 'ProcessingQueueClient',
      message: 'Error de conexión o runtime en Queue de BullMQ',
      ...sanitizeBullMqError(error),
    });
  });
}

export function attachWorkerListeners(
  worker: ListenableWorker,
  logger: RuntimeLogger,
): void {
  worker.on('error', (error: Error) => {
    logger.error({
      component: 'ProcessingWorker',
      message: 'Error de conexión o runtime en Worker de BullMQ',
      ...sanitizeBullMqError(error),
    });
  });

  worker.on('failed', (job, error: Error) => {
    logger.warn({
      component: 'ProcessingWorker',
      message: 'Trabajo process-document falló',
      documentVersionId: job?.data?.documentVersionId ?? 'desconocida',
      attemptsMade: job?.attemptsMade ?? 0,
      ...sanitizeBullMqError(error),
    });
  });

  worker.on('stalled', (jobId: string) => {
    logger.warn({
      component: 'ProcessingWorker',
      message: 'Trabajo process-document detectado como stalled',
      jobId,
    });
  });
}
