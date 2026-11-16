import { Queue, UnrecoverableError, Worker } from 'bullmq';
import { QueueUnavailableError } from '../../src/documents/ports/processing-queue';
import {
  BullMqProcessingQueue,
  PROCESS_DOCUMENT_JOB,
  ProcessDocumentJobData,
} from '../../src/processing/adapters/bullmq-processing-queue';
import { getTestBullMqConnection } from '../test-database';

describe('BullMqProcessingQueue (Redis real)', () => {
  let queue: Queue<ProcessDocumentJobData>;
  let name: string;

  beforeEach(() => {
    const { connection, keyPrefix } = getTestBullMqConnection();
    name = `test-documents-${Math.random().toString(36).slice(2)}`;
    queue = new Queue<ProcessDocumentJobData>(name, {
      connection,
      prefix: keyPrefix,
    });
  });

  afterEach(async () => {
    await queue.obliterate({ force: true });
    await queue.close();
  });

  it('encola process-document con documentVersionId y jobId igual a la versión', async () => {
    const adapter = new BullMqProcessingQueue(queue);

    await adapter.enqueue('ver-1');

    const job = await queue.getJob('ver-1');
    expect(job?.name).toBe(PROCESS_DOCUMENT_JOB);
    expect(job?.data).toEqual({ documentVersionId: 'ver-1' });
  });

  it('encolar dos veces la misma versión deja un solo trabajo', async () => {
    const adapter = new BullMqProcessingQueue(queue);

    await adapter.enqueue('ver-1');
    await adapter.enqueue('ver-1');

    const counts = await queue.getJobCounts('waiting', 'active', 'delayed');
    expect(counts.waiting + counts.active + counts.delayed).toBe(1);
  });

  it('lanza QueueUnavailableError si la cola no responde dentro del tiempo límite', async () => {
    const stalled = {
      add: () => new Promise<never>(() => undefined),
    } as unknown as Queue<ProcessDocumentJobData>;
    const adapter = new BullMqProcessingQueue(stalled, 50);

    await expect(adapter.enqueue('ver-1')).rejects.toBeInstanceOf(
      QueueUnavailableError,
    );
  });

  it('convierte cualquier error de la cola en QueueUnavailableError', async () => {
    const broken = {
      add: () => Promise.reject(new Error('ECONNREFUSED')),
    } as unknown as Queue<ProcessDocumentJobData>;
    const adapter = new BullMqProcessingQueue(broken);

    await expect(adapter.enqueue('ver-1')).rejects.toBeInstanceOf(
      QueueUnavailableError,
    );
  });

  it('A.1 completed con removeOnComplete: true elimina el job y permite reencolar el mismo jobId', async () => {
    const adapter = new BullMqProcessingQueue(queue);
    const { connection, keyPrefix } = getTestBullMqConnection();
    const processed: string[] = [];
    let completedCount = 0;
    let notifyCompleted!: () => void;
    let waitCompleted = new Promise<void>((r) => {
      notifyCompleted = r;
    });

    const worker = new Worker<ProcessDocumentJobData>(
      name,
      async (job) => {
        processed.push(job.data.documentVersionId);
        return 'ready';
      },
      { connection, prefix: keyPrefix },
    );
    worker.on('completed', () => {
      completedCount += 1;
      notifyCompleted();
    });

    try {
      await adapter.enqueue('ver-completed-1');
      await waitCompleted;
      expect(processed).toEqual(['ver-completed-1']);
      expect(await queue.getJob('ver-completed-1')).toBeUndefined();

      waitCompleted = new Promise<void>((r) => {
        notifyCompleted = r;
      });
      await adapter.enqueue('ver-completed-1');
      await waitCompleted;
      expect(completedCount).toBe(2);
      expect(processed).toEqual(['ver-completed-1', 'ver-completed-1']);
    } finally {
      await worker.close();
    }
  });

  it('A.2 failed con removeOnFail: 500 deduplica hasta que remove() libera el jobId para reencolar', async () => {
    const adapter = new BullMqProcessingQueue(queue);
    const { connection, keyPrefix } = getTestBullMqConnection();
    let attempt = 0;
    let notifyFailed!: () => void;
    const waitFailed = new Promise<void>((r) => {
      notifyFailed = r;
    });
    let notifyCompleted!: () => void;
    const waitCompleted = new Promise<void>((r) => {
      notifyCompleted = r;
    });

    const worker = new Worker<ProcessDocumentJobData>(
      name,
      async () => {
        attempt += 1;
        if (attempt === 1) {
          throw new UnrecoverableError('fallo permanente simulado');
        }
        return 'ready';
      },
      { connection, prefix: keyPrefix },
    );
    worker.on('failed', () => notifyFailed());
    worker.on('completed', () => notifyCompleted());

    try {
      await adapter.enqueue('ver-failed-1');
      await waitFailed;

      const failedJob = await queue.getJob('ver-failed-1');
      expect(failedJob).toBeDefined();
      expect(await failedJob!.getState()).toBe('failed');

      // Mientras permanezca en failed, enqueue() con mismo jobId no dispara otro intento
      await adapter.enqueue('ver-failed-1');
      await new Promise((r) => setTimeout(r, 150));
      expect(attempt).toBe(1);

      await failedJob!.remove();
      expect(await queue.getJob('ver-failed-1')).toBeUndefined();

      await adapter.enqueue('ver-failed-1');
      await waitCompleted;
      expect(attempt).toBe(2);
    } finally {
      await worker.close();
    }
  });
});
