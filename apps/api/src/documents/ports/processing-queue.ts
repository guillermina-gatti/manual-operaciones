// Cada implementación traduce sus errores técnicos a este error, que el servicio convierte en 503 (R8).
export class QueueUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'QueueUnavailableError';
  }
}

// Puerto (plan 5.2): la implementación real delegará en ProcessingService.enqueue de Guille.
export abstract class ProcessingQueue {
  abstract enqueue(documentVersionId: string): Promise<void>;
}
