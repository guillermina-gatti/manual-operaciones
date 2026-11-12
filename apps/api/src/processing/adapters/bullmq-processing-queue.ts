/* Cola real de procesamiento (plan 5.1). Encola process-document con { documentVersionId } y
   jobId = documentVersionId: encolar dos veces la misma versión no duplica el trabajo.
   Si Redis no responde dentro del tiempo límite, lanza QueueUnavailableError: la carga responde
   503 y deshace todo (D12). */
import { Queue } from 'bullmq';
import { ProcessingQueue, QueueUnavailableError } from '../../documents/ports/processing-queue';

export const PROCESSING_QUEUE_NAME = 'documents';
export const PROCESS_DOCUMENT_JOB = 'process-document';
export const PROCESS_DOCUMENT_ATTEMPTS = 5;
export const DEFAULT_ENQUEUE_TIMEOUT_MS = 3000;

export interface ProcessDocumentJobData {
  documentVersionId: string;
}

export class BullMqProcessingQueue extends ProcessingQueue {
  constructor(
    private readonly queue: Pick<Queue<ProcessDocumentJobData>, 'add'>,
    private readonly timeoutMs = DEFAULT_ENQUEUE_TIMEOUT_MS,
  ) {
    super();
  }

  async enqueue(documentVersionId: string): Promise<void> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new QueueUnavailableError(`La cola no respondió en ${this.timeoutMs} ms`)),
        this.timeoutMs,
      );
    });
    try {
      await Promise.race([
        this.queue.add(
          PROCESS_DOCUMENT_JOB,
          { documentVersionId },
          {
            jobId: documentVersionId,
            attempts: PROCESS_DOCUMENT_ATTEMPTS,
            backoff: { type: 'exponential', delay: 2000 },
            removeOnComplete: true, // así una versión ya procesada no bloquea un nuevo encolado
            removeOnFail: 500, // conservar los fallidos para revisarlos
          },
        ),
        timeout,
      ]);
    } catch (error) {
      if (error instanceof QueueUnavailableError) throw error;
      throw new QueueUnavailableError('No se pudo encolar el procesamiento', { cause: error });
    } finally {
      clearTimeout(timer);
    }
  }
}