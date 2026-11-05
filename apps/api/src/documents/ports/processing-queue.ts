// Excepción y puerto para manejar el encolado de tareas de procesamiento en segundo plano.
export class QueueUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'QueueUnavailableError';
  }
}

export abstract class ProcessingQueue {
  abstract enqueue(documentVersionId: string): Promise<void>;
}
