import { Queue } from 'bullmq';
import { QueueUnavailableError } from '../../documents/ports/processing-queue';
import {
  BullMqProcessingQueue,
  PROCESS_DOCUMENT_JOB,
  ProcessDocumentJobData,
} from './bullmq-processing-queue';

const REDIS = { host: process.env.TEST_REDIS_HOST ?? 'localhost', port: Number(process.env.TEST_REDIS_PORT ?? 6379) };

describe('BullMqProcessingQueue (Redis real)', () => {
  let queue: Queue<ProcessDocumentJobData>;
  let name: string;

  beforeEach(() => {
    name = `test-documents-${Math.random().toString(36).slice(2)}`;
    queue = new Queue<ProcessDocumentJobData>(name, { connection: REDIS });
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
    const stalled = { add: () => new Promise<never>(() => undefined) } as unknown as Queue<ProcessDocumentJobData>;
    const adapter = new BullMqProcessingQueue(stalled, 50);

    await expect(adapter.enqueue('ver-1')).rejects.toBeInstanceOf(QueueUnavailableError);
  });

  it('convierte cualquier error de la cola en QueueUnavailableError', async () => {
    const broken = { add: () => Promise.reject(new Error('ECONNREFUSED')) } as unknown as Queue<ProcessDocumentJobData>;
    const adapter = new BullMqProcessingQueue(broken);

    await expect(adapter.enqueue('ver-1')).rejects.toBeInstanceOf(QueueUnavailableError);
  });
});