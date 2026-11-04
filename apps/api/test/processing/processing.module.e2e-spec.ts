import 'reflect-metadata';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { PrismaModule } from '../../src/prisma/prisma.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { ProcessingQueue } from '../../src/documents/ports/processing-queue';
import { BullMqProcessingQueue } from '../../src/processing/adapters/bullmq-processing-queue';
import { ProcessingModule } from '../../src/processing/processing.module';
import {
  ProcessingQueueClient,
  ProcessingWorker,
} from '../../src/processing/processing.runtime';

process.env.GOOGLE_GENERATIVE_AI_API_KEY ??= 'clave-de-prueba'; // el modelo no se invoca acá
const redisUrl = process.env.TEST_REDIS_URL ?? 'redis://localhost:6379/1';

async function buildModule(workerEnabled: boolean) {
  return Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        ignoreEnvFile: true,
        load: [
          () => ({
            REDIS_URL: redisUrl,
            PROCESSING_WORKER_ENABLED: workerEnabled ? 'true' : 'false',
          }),
        ],
      }),
      PrismaModule,
      ProcessingModule,
    ],
  })
    .overrideProvider(PrismaService)
    .useValue({}) // el grafo no toca la base: el repositorio solo guarda la referencia
    .compile();
}

describe('ProcessingModule', () => {
  it('resuelve el grafo, expone la cola real y se cierra', async () => {
    const moduleRef = await buildModule(true);
    await moduleRef.init();

    expect(moduleRef.get(ProcessingQueue)).toBeInstanceOf(
      BullMqProcessingQueue,
    );
    expect(moduleRef.get(ProcessingWorker)).toBeInstanceOf(ProcessingWorker);

    await moduleRef.close();
  }, 15000);

  it('con el worker apagado igual expone la cola y encola sin consumir', async () => {
    const moduleRef = await buildModule(false);
    await moduleRef.init();
    const client = moduleRef.get(ProcessingQueueClient);

    try {
      await moduleRef.get(ProcessingQueue).enqueue('ver-modulo-1');
      expect((await client.queue.getJobCounts('waiting')).waiting).toBe(1);
    } finally {
      await client.queue.obliterate({ force: true });
      await moduleRef.close();
    }
  }, 15000);
});
