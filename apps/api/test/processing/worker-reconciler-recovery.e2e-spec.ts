/* M2-B.6.4-B — Pruebas de integración reales Worker–Redis–PostgreSQL.
   Valida BullMQ 6.4.0, Redis 7 (DB 1, prefijo test:e2e:), PostgreSQL 16 (manual_e2e_test),
   ProcessingService, ProcessDocumentHandler, PrismaProcessingRepository y ProcessingReconcilerService. */
import { randomUUID } from 'node:crypto';
import { Queue, Worker } from 'bullmq';
import { AREA_IDS } from '../../src/documents/adapters/fixtures';
import { PrismaService } from '../../src/prisma/prisma.service';
import {
  BullMqProcessingQueue,
  ProcessDocumentJobData,
} from '../../src/processing/adapters/bullmq-processing-queue';
import { PrismaProcessingRepository } from '../../src/processing/adapters/prisma-processing.repository';
import { DocumentBytesReader } from '../../src/processing/ports/document-bytes-reader';
import {
  EMBEDDING_DIMENSIONS,
  EmbeddingProvider,
} from '../../src/processing/ports/embedding-provider';
import { ProcessDocumentHandler } from '../../src/processing/process-document.handler';
import { ProcessingReconcilerService } from '../../src/processing/processing-reconciler.service';
import { attachWorkerListeners } from '../../src/processing/processing-runtime-listeners';
import { ProcessingService } from '../../src/processing/processing.service';
import { StorageUnavailableError } from '../../src/storage/file-storage';
import { cleanDocuments, seedDocument } from '../documents/helpers';
import { getTestBullMqConnection } from '../test-database';

const SAMPLE_DOC = Buffer.from(
  '# Procedimiento de Caja\n\nContar el efectivo al cierre del turno.',
  'utf8',
);

const silentLogger = {
  warn: () => undefined,
  error: () => undefined,
  log: () => undefined,
};

function makeFakeEmbeddings(): EmbeddingProvider {
  return {
    embedMany: async (texts: string[]) =>
      texts.map(() => Array.from({ length: EMBEDDING_DIMENSIONS }, () => 0.25)),
  };
}

describe('Worker–Redis–PostgreSQL Recovery (E2E real)', () => {
  let prisma: PrismaService;
  let repo: PrismaProcessingRepository;
  let queue: Queue<ProcessDocumentJobData>;
  let bullQueue: BullMqProcessingQueue;
  let queueName: string;
  const activeWorkers: Worker<ProcessDocumentJobData>[] = [];

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    repo = new PrismaProcessingRepository(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await cleanDocuments(prisma);
    const { connection, keyPrefix } = getTestBullMqConnection();
    queueName = `test-m2b64-${randomUUID()}`;
    queue = new Queue<ProcessDocumentJobData>(queueName, {
      connection,
      prefix: keyPrefix,
    });
    bullQueue = new BullMqProcessingQueue(queue);
  });

  afterEach(async () => {
    while (activeWorkers.length > 0) {
      const w = activeWorkers.pop()!;
      await w.close();
    }
    await queue.obliterate({ force: true });
    await queue.close();
  });

  function spawnWorker(
    reader: DocumentBytesReader,
    embeddings: EmbeddingProvider = makeFakeEmbeddings(),
    serviceOptions?: { leaseTtlSeconds?: number; heartbeatIntervalMs?: number },
  ): Worker<ProcessDocumentJobData> {
    const { connection, keyPrefix } = getTestBullMqConnection();
    const service = new ProcessingService(repo, reader, embeddings, serviceOptions);
    const handler = new ProcessDocumentHandler(service, repo);
    const worker = new Worker<ProcessDocumentJobData>(
      queueName,
      (job) => handler.handle(job),
      { connection, prefix: keyPrefix, concurrency: 1 },
    );
    attachWorkerListeners(worker, silentLogger);
    activeWorkers.push(worker);
    return worker;
  }

  it('B.1 error transitorio libera el claim, reintenta en BullMQ con nuevo claimToken y completa READY', async () => {
    const seeded = await seedDocument(prisma, { areaIds: [AREA_IDS.ventas] });
    await prisma.documentVersion.update({
      where: { id: seeded.versionId },
      data: { mimeType: 'text/markdown' },
    });

    const observedTokens: string[] = [];
    let attempt = 0;
    const reader: DocumentBytesReader = {
      read: async () => {
        attempt += 1;
        const row = await prisma.documentVersion.findUniqueOrThrow({
          where: { id: seeded.versionId },
        });
        expect(row.processingStatus).toBe('PROCESSING');
        observedTokens.push(row.claimToken!);
        if (attempt === 1) {
          throw new StorageUnavailableError('S3 timeout transitorio');
        }
        return SAMPLE_DOC;
      },
    };

    const worker = spawnWorker(reader);
    const completed = new Promise<void>((resolve, reject) => {
      worker.on('completed', () => resolve());
      worker.on('failed', (_job, err) => {
        if (attempt >= 2) reject(err);
      });
    });

    await bullQueue.enqueue(seeded.versionId);
    await completed;

    expect(attempt).toBe(2);
    expect(observedTokens).toHaveLength(2);
    expect(observedTokens[0]).not.toBe(observedTokens[1]);

    const finalVersion = await prisma.documentVersion.findUniqueOrThrow({
      where: { id: seeded.versionId },
    });
    expect(finalVersion.processingStatus).toBe('READY');
    expect(finalVersion.claimToken).toBeNull();
    expect(
      await prisma.chunk.count({ where: { documentVersionId: seeded.versionId } }),
    ).toBe(1);
  }, 15_000);

  it('B.2 agotamiento de 5 intentos con backoff exponencial real deja FAILED en PostgreSQL', async () => {
    const seeded = await seedDocument(prisma, { areaIds: [AREA_IDS.ventas] });
    await prisma.documentVersion.update({
      where: { id: seeded.versionId },
      data: { mimeType: 'text/markdown' },
    });

    const timestamps: number[] = [];
    const tokens: string[] = [];
    const reader: DocumentBytesReader = {
      read: async () => {
        timestamps.push(Date.now());
        const row = await prisma.documentVersion.findUniqueOrThrow({
          where: { id: seeded.versionId },
        });
        tokens.push(row.claimToken!);
        throw new StorageUnavailableError('S3 caído');
      },
    };

    const worker = spawnWorker(reader);
    const exhausted = new Promise<string>((resolve) => {
      worker.on('completed', (_job, result) => {
        if (result === 'failed') resolve(result);
      });
    });

    await bullQueue.enqueue(seeded.versionId);
    const outcome = await exhausted;

    expect(outcome).toBe('failed');
    expect(timestamps).toHaveLength(5);
    expect(new Set(tokens).size).toBe(5);
    // Backoff exponencial real: ~2s, ~4s, ~8s, ~16s (creciente)
    const deltas = timestamps.slice(1).map((t, i) => t - timestamps[i]);
    expect(deltas[0]).toBeGreaterThanOrEqual(1500);
    expect(deltas[1]).toBeGreaterThan(deltas[0]);
    expect(deltas[2]).toBeGreaterThan(deltas[1]);
    expect(deltas[3]).toBeGreaterThan(deltas[2]);

    const finalVersion = await prisma.documentVersion.findUniqueOrThrow({
      where: { id: seeded.versionId },
    });
    expect(finalVersion.processingStatus).toBe('FAILED');
    expect(finalVersion.processingError).toContain('S3 caído');
    expect(finalVersion.claimToken).toBeNull();
  }, 45_000);

  it('B.3 error permanente (EmptyDocumentError) marca FAILED en el primer intento sin reintentar', async () => {
    const seeded = await seedDocument(prisma, { areaIds: [AREA_IDS.ventas] });
    await prisma.documentVersion.update({
      where: { id: seeded.versionId },
      data: { mimeType: 'text/markdown' },
    });

    let attempts = 0;
    const reader: DocumentBytesReader = {
      read: async () => {
        attempts += 1;
        return Buffer.from('   \n  ', 'utf8');
      },
    };

    const worker = spawnWorker(reader);
    const failed = new Promise<void>((resolve) => {
      worker.on('failed', () => resolve());
    });

    await bullQueue.enqueue(seeded.versionId);
    await failed;

    expect(attempts).toBe(1);
    const finalVersion = await prisma.documentVersion.findUniqueOrThrow({
      where: { id: seeded.versionId },
    });
    expect(finalVersion.processingStatus).toBe('FAILED');
    expect(finalVersion.claimToken).toBeNull();
  }, 15_000);

  it('C recuperación de PENDING antiguo perdido en Redis mediante ProcessingReconcilerService', async () => {
    const seeded = await seedDocument(prisma, { areaIds: [AREA_IDS.ventas] });
    await prisma.$executeRaw`
      UPDATE document_versions
         SET mime_type = 'text/markdown',
             created_at = now() - interval '5 minutes'
       WHERE id = ${seeded.versionId}::uuid`;

    const reader: DocumentBytesReader = { read: async () => SAMPLE_DOC };
    const worker = spawnWorker(reader);
    const completed = new Promise<void>((resolve) => {
      worker.on('completed', () => resolve());
    });

    const reconciler = new ProcessingReconcilerService(repo, bullQueue, queue, {
      enabled: false,
      pendingMinAgeSeconds: 120,
      logger: silentLogger,
    });

    const summary = await reconciler.reconcileOnce();
    expect(summary).toEqual({ candidates: 1, recovered: 1, skipped: 0, failed: 0 });

    await completed;
    const finalVersion = await prisma.documentVersion.findUniqueOrThrow({
      where: { id: seeded.versionId },
    });
    expect(finalVersion.processingStatus).toBe('READY');
    expect(
      await prisma.chunk.count({ where: { documentVersionId: seeded.versionId } }),
    ).toBe(1);
  }, 15_000);

  it('D PROCESSING con lease vigente y job perdido en Redis no es recuperado por el reconciliador', async () => {
    const seeded = await seedDocument(prisma, { areaIds: [AREA_IDS.ventas] });
    await prisma.documentVersion.update({
      where: { id: seeded.versionId },
      data: { mimeType: 'text/markdown' },
    });

    let notifyEntered!: () => void;
    const enteredBarrier = new Promise<void>((r) => {
      notifyEntered = r;
    });
    let releaseWorker!: () => void;
    const workerGate = new Promise<void>((r) => {
      releaseWorker = r;
    });

    const reader: DocumentBytesReader = {
      read: async () => {
        notifyEntered();
        await workerGate;
        return SAMPLE_DOC;
      },
    };
    const worker = spawnWorker(reader);
    const finished = new Promise<void>((resolve) => {
      worker.on('completed', () => resolve());
      worker.on('failed', () => resolve());
      worker.on('error', () => resolve());
    });

    await bullQueue.enqueue(seeded.versionId);
    await enteredBarrier;

    // Simular pérdida del job activo en la cola efímera del test
    await queue.obliterate({ force: true });
    expect(await queue.getJob(seeded.versionId)).toBeUndefined();

    const before = await prisma.documentVersion.findUniqueOrThrow({
      where: { id: seeded.versionId },
    });
    expect(before.processingStatus).toBe('PROCESSING');

    const reconciler = new ProcessingReconcilerService(repo, bullQueue, queue, {
      enabled: false,
      pendingMinAgeSeconds: 120,
      logger: silentLogger,
    });
    const summary = await reconciler.reconcileOnce();
    expect(summary).toEqual({ candidates: 0, recovered: 0, skipped: 0, failed: 0 });
    expect(await queue.getJob(seeded.versionId)).toBeUndefined();

    const during = await prisma.documentVersion.findUniqueOrThrow({
      where: { id: seeded.versionId },
    });
    expect(during.claimToken).toBe(before.claimToken);

    releaseWorker();
    await finished;

    const finalVersion = await prisma.documentVersion.findUniqueOrThrow({
      where: { id: seeded.versionId },
    });
    expect(finalVersion.processingStatus).toBe('READY');
    expect(
      await prisma.chunk.count({ where: { documentVersionId: seeded.versionId } }),
    ).toBe(1);
  }, 15_000);

  it('E/F lease vencido + carrera Worker–reconciliador: Worker 2 completa READY y Worker 1 obsoleto es rechazado como stale', async () => {
    const seeded = await seedDocument(prisma, { areaIds: [AREA_IDS.ventas] });
    await prisma.documentVersion.update({
      where: { id: seeded.versionId },
      data: { mimeType: 'text/markdown' },
    });

    let notifyWorker1Entered!: () => void;
    const worker1Entered = new Promise<void>((r) => {
      notifyWorker1Entered = r;
    });
    let releaseWorker1!: () => void;
    const worker1Gate = new Promise<void>((r) => {
      releaseWorker1 = r;
    });

    const reader1: DocumentBytesReader = {
      read: async () => {
        notifyWorker1Entered();
        await worker1Gate;
        return Buffer.from('# Viejo\n\nContenido obsoleto de Worker 1.', 'utf8');
      },
    };
    const commitSpy = jest.spyOn(repo, 'commitLocked');
    try {
      const worker1 = spawnWorker(reader1);

      await bullQueue.enqueue(seeded.versionId);
      await worker1Entered;

      const claim1Row = await prisma.documentVersion.findUniqueOrThrow({
        where: { id: seeded.versionId },
      });
      expect(claim1Row.processingStatus).toBe('PROCESSING');
      const token1 = claim1Row.claimToken!;

      // Simular pérdida del job en la cola efímera y vencimiento del lease en PostgreSQL
      await queue.obliterate({ force: true });
      await prisma.$executeRaw`
        UPDATE document_versions
           SET lease_expires_at = now() - interval '5 seconds'
         WHERE id = ${seeded.versionId}::uuid`;

      const reconciler = new ProcessingReconcilerService(repo, bullQueue, queue, {
        enabled: false,
        pendingMinAgeSeconds: 120,
        logger: silentLogger,
      });
      const summary = await reconciler.reconcileOnce();
      expect(summary).toEqual({ candidates: 1, recovered: 1, skipped: 0, failed: 0 });

      // Worker 2 independiente procesa el job recuperado mientras Worker 1 sigue bloqueado
      const reader2: DocumentBytesReader = {
        read: async () =>
          Buffer.from('# Nuevo\n\nContenido válido de Worker 2.', 'utf8'),
      };
      const worker2 = spawnWorker(reader2);
      const worker2Completed = new Promise<void>((resolve, reject) => {
        worker2.on('completed', () => resolve());
        worker2.on('failed', (_job, err) => reject(err));
      });
      await worker2Completed;

      const afterWorker2 = await prisma.documentVersion.findUniqueOrThrow({
        where: { id: seeded.versionId },
      });
      expect(afterWorker2.processingStatus).toBe('READY');
      expect(afterWorker2.claimToken).toBeNull();

      // Liberar Worker 1: su commitLocked debe ser rechazado como stale sin pisar chunks de Worker 2
      const worker1Settled = new Promise<void>((resolve) => {
        worker1.on('completed', () => resolve());
        worker1.on('failed', () => resolve());
        worker1.on('error', () => resolve());
      });
      releaseWorker1();
      await worker1Settled;

      expect(commitSpy).toHaveBeenCalledTimes(2);
      expect(commitSpy.mock.calls[0][2]).not.toBe(token1);
      await expect(commitSpy.mock.results[0].value).resolves.toBe('ready');
      expect(commitSpy.mock.calls[1][2]).toBe(token1);
      await expect(commitSpy.mock.results[1].value).resolves.toBe('stale');

      const finalVersion = await prisma.documentVersion.findUniqueOrThrow({
        where: { id: seeded.versionId },
      });
      expect(finalVersion.processingStatus).toBe('READY');
      expect(finalVersion.claimToken).not.toBe(token1);

      const chunks = await prisma.chunk.findMany({
        where: { documentVersionId: seeded.versionId },
      });
      expect(chunks).toHaveLength(1);
      expect(chunks[0].content).toContain('Contenido válido de Worker 2');
      expect(chunks[0].content).not.toContain('obsoleto');
    } finally {
      commitSpy.mockRestore();
    }
  }, 20_000);
});
