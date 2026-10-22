import { Injectable, Logger } from '@nestjs/common';
import {
  ProcessingQueue,
  QueueUnavailableError,
} from '../ports/processing-queue';

// Simulación hasta que exista ProcessingService (plan 5.2).
@Injectable()
export class FakeProcessingQueue extends ProcessingQueue {
  readonly enqueued: string[] = [];
  private readonly logger = new Logger(FakeProcessingQueue.name);
  private shouldFailNext = false;

  failNext(): void {
    this.shouldFailNext = true;
  }

  async enqueue(documentVersionId: string): Promise<void> {
    await this.failIfConfigured(documentVersionId);
    this.enqueued.push(documentVersionId);
    this.logger.log(`Versión ${documentVersionId} encolada para procesar`);
  }

  // Rechaza como lo haría la cola real al no responder, en vez de lanzar en el momento.
  private failIfConfigured(documentVersionId: string): Promise<void> {
    if (!this.shouldFailNext) return Promise.resolve();
    this.shouldFailNext = false;
    return Promise.reject(
      new QueueUnavailableError(
        `FakeProcessingQueue configurada para fallar al encolar ${documentVersionId}`,
      ),
    );
  }
}
