/* Piezas de ejecución de la cola: el cliente de la cola (se cierra al apagar la app) y el worker
   que consume process-document. El worker corre en el mismo proceso que la API, con concurrencia 1
   para no saturar la API de embeddings. PROCESSING_WORKER_ENABLED=false lo apaga. */
import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker } from 'bullmq';
import type { ConnectionOptions } from 'bullmq';
import { PROCESSING_QUEUE_NAME, ProcessDocumentJobData } from './adapters/bullmq-processing-queue';
import { ProcessDocumentHandler } from './process-document.handler';

export const PROCESSING_CONNECTION = 'PROCESSING_CONNECTION';

@Injectable()
export class ProcessingQueueClient implements OnModuleDestroy {
  readonly queue: Queue<ProcessDocumentJobData>;

  constructor(@Inject(PROCESSING_CONNECTION) connection: ConnectionOptions) {
    this.queue = new Queue<ProcessDocumentJobData>(PROCESSING_QUEUE_NAME, { connection });
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
  }
}

@Injectable()
export class ProcessingWorker implements OnModuleDestroy {
  private readonly logger = new Logger(ProcessingWorker.name);
  private readonly worker?: Worker<ProcessDocumentJobData>;

  constructor(
    @Inject(PROCESSING_CONNECTION) connection: ConnectionOptions,
    handler: ProcessDocumentHandler,
    config: ConfigService,
  ) {
    if (config.get<string>('PROCESSING_WORKER_ENABLED') === 'false') return;

    this.worker = new Worker<ProcessDocumentJobData>(
      PROCESSING_QUEUE_NAME,
      (job) => handler.handle(job),
      { connection, concurrency: 1 },
    );
    this.worker.on('failed', (job, error) => {
      this.logger.warn(
        `process-document falló para la versión ${job?.data.documentVersionId ?? 'desconocida'}: ${error.message}`,
      );
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
  }
}