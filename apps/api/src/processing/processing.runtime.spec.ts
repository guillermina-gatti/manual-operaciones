import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { BullMqProcessingQueue } from './adapters/bullmq-processing-queue';
import { redisConnectionFromUrl } from './redis-connection';
import { ProcessDocumentHandler } from './process-document.handler';
import { ProcessingQueueClient, ProcessingWorker } from './processing.runtime';

const connection = redisConnectionFromUrl(process.env.TEST_REDIS_URL ?? 'redis://localhost:6379/1');
const configWithWorker = { get: () => undefined } as unknown as ConfigService;

async function waitFor(condition: () => boolean, timeoutMs: number): Promise<void> {
  const started = Date.now();
  while (!condition()) {
    if (Date.now() - started > timeoutMs) throw new Error('Se agotó el tiempo esperando al worker');
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

describe('ProcessingWorker (Redis real)', () => {
  it('procesa los trabajos encolados con el manejador', async () => {
    const client = new ProcessingQueueClient(connection);
    const handled: string[] = [];
    const handler = {
      handle: async (job: { data: { documentVersionId: string } }) => {
        handled.push(job.data.documentVersionId);
        return 'ready';
      },
    } as unknown as ProcessDocumentHandler;
    const worker = new ProcessingWorker(connection, handler, configWithWorker);

    try {
      await new BullMqProcessingQueue(client.queue).enqueue('ver-worker-1');
      await waitFor(() => handled.length === 1, 8000);

      expect(handled).toEqual(['ver-worker-1']);
    } finally {
      await worker.onModuleDestroy();
      await client.queue.obliterate({ force: true });
      await client.onModuleDestroy();
    }
  }, 15000);

  it('con PROCESSING_WORKER_ENABLED=false no consume trabajos', async () => {
    const client = new ProcessingQueueClient(connection);
    const handled: string[] = [];
    const handler = {
      handle: async (job: { data: { documentVersionId: string } }) => {
        handled.push(job.data.documentVersionId);
        return 'ready';
      },
    } as unknown as ProcessDocumentHandler;
    const disabled = { get: (key: string) => (key === 'PROCESSING_WORKER_ENABLED' ? 'false' : undefined) } as unknown as ConfigService;
    const worker = new ProcessingWorker(connection, handler, disabled);

    try {
      await new BullMqProcessingQueue(client.queue).enqueue('ver-disabled-1');
      await new Promise((resolve) => setTimeout(resolve, 800));

      expect(handled).toEqual([]);
      expect((await client.queue.getJobCounts('waiting')).waiting).toBe(1);
    } finally {
      await worker.onModuleDestroy();
      await client.queue.obliterate({ force: true });
      await client.onModuleDestroy();
    }
  }, 15000);
});