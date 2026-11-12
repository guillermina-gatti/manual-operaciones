/* Arma la feature de procesamiento (HU14, plan 5): conexión propia a Redis para BullMQ, cola real
   de process-document, worker en el mismo proceso, Gemini para embeddings y repositorio Prisma.
   Exporta ProcessingQueue: DocumentsModule la usa para encolar al subir una versión. */
import { google } from '@ai-sdk/google';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ConnectionOptions } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { FileStorage } from '../storage/file-storage';
import { StorageModule } from '../storage/storage.module';
import { ProcessingQueue } from '../documents/ports/processing-queue';
import { BullMqProcessingQueue } from './adapters/bullmq-processing-queue';
import { FileStorageBytesReader } from './adapters/file-storage-bytes-reader';
import {
  EMBEDDING_MODEL_ID,
  GeminiEmbeddingProvider,
} from './adapters/gemini-embedding-provider';
import { PrismaProcessingRepository } from './adapters/prisma-processing.repository';
import { DocumentBytesReader } from './ports/document-bytes-reader';
import { EmbeddingProvider } from './ports/embedding-provider';
import { ProcessingRepository } from './ports/processing-repository';
import { ProcessDocumentHandler } from './process-document.handler';
import {
  PROCESSING_CONNECTION,
  ProcessingQueueClient,
  ProcessingWorker,
} from './processing.runtime';
import { ProcessingService } from './processing.service';
import { DEFAULT_REDIS_URL, redisConnectionFromUrl } from './redis-connection';

@Module({
  imports: [StorageModule], // FileStorage; PrismaService llega del PrismaModule global
  providers: [
    {
      provide: PROCESSING_CONNECTION,
      inject: [ConfigService],
      useFactory: (config: ConfigService): ConnectionOptions =>
        redisConnectionFromUrl(
          config.get<string>('REDIS_URL') || DEFAULT_REDIS_URL,
        ),
    },
    ProcessingQueueClient,
    {
      provide: ProcessingQueue,
      inject: [ProcessingQueueClient],
      useFactory: (client: ProcessingQueueClient): ProcessingQueue =>
        new BullMqProcessingQueue(client.queue),
    },
    {
      provide: ProcessingRepository,
      inject: [PrismaService],
      useFactory: (prisma: PrismaService): ProcessingRepository =>
        new PrismaProcessingRepository(prisma),
    },
    {
      provide: DocumentBytesReader,
      inject: [FileStorage],
      useFactory: (storage: FileStorage): DocumentBytesReader =>
        new FileStorageBytesReader(storage),
    },
    {
      provide: EmbeddingProvider,
      useFactory: (): EmbeddingProvider =>
        new GeminiEmbeddingProvider(google.embeddingModel(EMBEDDING_MODEL_ID)),
    },
    {
      provide: ProcessingService,
      inject: [ProcessingRepository, DocumentBytesReader, EmbeddingProvider],
      useFactory: (
        repository: ProcessingRepository,
        reader: DocumentBytesReader,
        embeddings: EmbeddingProvider,
      ): ProcessingService =>
        new ProcessingService(repository, reader, embeddings),
    },
    {
      provide: ProcessDocumentHandler,
      inject: [ProcessingService, ProcessingRepository],
      useFactory: (
        service: ProcessingService,
        repository: ProcessingRepository,
      ): ProcessDocumentHandler =>
        new ProcessDocumentHandler(service, repository),
    },
    ProcessingWorker,
  ],
  exports: [ProcessingQueue, EmbeddingProvider],
})
export class ProcessingModule { }