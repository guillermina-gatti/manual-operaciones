/* Repositorio de procesamiento contra la base real (Prisma). Mismos escenarios que se verificaron
   con Postgres: el lock FOR SHARE y los casos de carrera del plan 003. */
import { AREA_IDS } from '../../src/documents/adapters/fixtures';
import { PrismaProcessingRepository } from '../../src/processing/adapters/prisma-processing.repository';
import { buildChunkRows } from '../../src/processing/processing.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { cleanDocuments, seedDocument } from '../documents/helpers';

const CHUNKS = [
  { chunkIndex: 0, content: 'Abrir la caja a las ocho.', pageNumber: null, tokenCount: 7, section: 'Apertura' },
];
const EMBEDDINGS = [Array.from({ length: 768 }, () => 0.1)];

describe('PrismaProcessingRepository (e2e)', () => {
  let prisma: PrismaService;
  let repo: PrismaProcessingRepository;
  const plan = (state: Parameters<typeof buildChunkRows>[0]) => buildChunkRows(state, CHUNKS, EMBEDDINGS);

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
  });

  it('findVersion devuelve la versión, o null si no existe', async () => {
    const seeded = await seedDocument(prisma, { areaIds: [AREA_IDS.ventas] });

    const found = await repo.findVersion(seeded.versionId);

    expect(found).toMatchObject({ id: seeded.versionId, documentId: seeded.id, storageKey: seeded.storageKey });
    expect(await repo.findVersion('00000000-0000-4000-8000-000000000000')).toBeNull();
  });

  it('commitLocked guarda los fragmentos con área y sección, y deja la versión READY', async () => {
    const seeded = await seedDocument(prisma, { areaIds: [AREA_IDS.ventas] });
    const claim = await repo.claimForProcessing(seeded.versionId, 180);
    if (!claim.acquired) throw new Error('Expected claim');

    const outcome = await repo.commitLocked(seeded.versionId, plan, claim.claimToken);

    expect(outcome).toBe('ready');
    const chunks = await prisma.chunk.findMany({ where: { documentVersionId: seeded.versionId } });
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({ section: 'Apertura', isActive: true, areaIds: [AREA_IDS.ventas] });
    const version = await prisma.documentVersion.findUniqueOrThrow({ where: { id: seeded.versionId } });
    expect(version.processingStatus).toBe('READY');
    expect(version.processingError).toBeNull();
  });

  it('una versión REPLACED se guarda READY pero con fragmentos inactivos', async () => {
    const seeded = await seedDocument(prisma, { areaIds: [AREA_IDS.ventas] });
    await prisma.documentVersion.update({ where: { id: seeded.versionId }, data: { status: 'REPLACED' } });
    const claim = await repo.claimForProcessing(seeded.versionId, 180);
    if (!claim.acquired) throw new Error('Expected claim');

    await repo.commitLocked(seeded.versionId, plan, claim.claimToken);

    const chunks = await prisma.chunk.findMany({ where: { documentVersionId: seeded.versionId } });
    expect(chunks.every((c) => c.isActive === false)).toBe(true);
    const version = await prisma.documentVersion.findUniqueOrThrow({ where: { id: seeded.versionId } });
    expect(version.processingStatus).toBe('READY');
  });

  it('versión inexistente: descarta sin guardar nada', async () => {
    const outcome = await repo.commitLocked(
      '00000000-0000-4000-8000-000000000000',
      plan,
      '00000000-0000-4000-8000-000000000001',
    );

    expect(outcome).toBe('discarded');
    expect(await prisma.chunk.count()).toBe(0);
  });

  it('reintentar el commit con un nuevo claim tras expirar no duplica fragmentos', async () => {
    const seeded = await seedDocument(prisma, { areaIds: [AREA_IDS.ventas] });
    const c1 = await repo.claimForProcessing(seeded.versionId, 180);
    if (!c1.acquired) throw new Error('Expected claim');
    await repo.commitLocked(seeded.versionId, plan, c1.claimToken);
    await prisma.$executeRaw`UPDATE document_versions SET processing_status = 'PENDING'::"ProcessingStatus" WHERE id = ${seeded.versionId}::uuid`;
    const c2 = await repo.claimForProcessing(seeded.versionId, 180);
    if (!c2.acquired) throw new Error('Expected claim');
    await repo.commitLocked(seeded.versionId, plan, c2.claimToken);

    expect(await prisma.chunk.count({ where: { documentVersionId: seeded.versionId } })).toBe(1);
  });

  it('markFailed deja la versión FAILED con el motivo', async () => {
    const seeded = await seedDocument(prisma, { areaIds: [AREA_IDS.ventas] });
    const claim = await repo.claimForProcessing(seeded.versionId, 180);
    if (!claim.acquired) throw new Error('Expected claim');

    await repo.markFailed(seeded.versionId, 'El PDF no tiene texto extraíble', claim.claimToken);

    const version = await prisma.documentVersion.findUniqueOrThrow({ where: { id: seeded.versionId } });
    expect(version.processingStatus).toBe('FAILED');
    expect(version.processingError).toBe('El PDF no tiene texto extraíble');
  });

  it('cambio de áreas concurrente: el worker espera el lock y guarda las áreas nuevas', async () => {
    const seeded = await seedDocument(prisma, { areaIds: [AREA_IDS.ventas] });
    const claim = await repo.claimForProcessing(seeded.versionId, 180);
    if (!claim.acquired) throw new Error('Expected claim');

    // Operación de Matías: toma FOR UPDATE, cambia las áreas y mantiene la transacción abierta.
    const holder = prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM documents WHERE id = ${seeded.id}::uuid FOR UPDATE`;
      await tx.$executeRaw`
        UPDATE document_areas SET area_id = ${AREA_IDS.operaciones}::uuid
         WHERE document_id = ${seeded.id}::uuid`;
      await new Promise((resolve) => setTimeout(resolve, 800));
    });
    await new Promise((resolve) => setTimeout(resolve, 200)); // el worker llega mientras está tomado
    const commit = repo.commitLocked(seeded.versionId, plan, claim.claimToken);

    await Promise.all([holder, commit]);

    const chunks = await prisma.chunk.findMany({ where: { documentVersionId: seeded.versionId } });
    expect(chunks[0].areaIds).toEqual([AREA_IDS.operaciones]);
  });

  describe('M2-B.2 claims, leases y fencing', () => {
    it('adquiere el claim sobre PENDING y rechaza un segundo claim mientras el lease está vigente', async () => {
      const seeded = await seedDocument(prisma, { areaIds: [AREA_IDS.ventas] });

      const first = await repo.claimForProcessing(seeded.versionId, 180);
      const second = await repo.claimForProcessing(seeded.versionId, 180);

      expect(first.acquired).toBe(true);
      expect(second).toEqual({ acquired: false, reason: 'already_claimed' });

      const row = await prisma.documentVersion.findUniqueOrThrow({ where: { id: seeded.versionId } });
      expect(row.processingStatus).toBe('PROCESSING');
      expect(row.processingStartedAt).not.toBeNull();
      expect(row.leaseExpiresAt).not.toBeNull();
      if (first.acquired) {
        expect(row.claimToken).toBe(first.claimToken);
      }
    });

    it('dos claims concurrentes sobre la misma versión: solo uno adquiere el control', async () => {
      const seeded = await seedDocument(prisma, { areaIds: [AREA_IDS.ventas] });

      const [a, b] = await Promise.all([
        repo.claimForProcessing(seeded.versionId, 180),
        repo.claimForProcessing(seeded.versionId, 180),
      ]);

      const acquiredCount = [a, b].filter((r) => r.acquired).length;
      expect(acquiredCount).toBe(1);
    });

    it('recupera una versión PROCESSING con lease vencido generando nuevo token y nuevo processingStartedAt', async () => {
      const seeded = await seedDocument(prisma, { areaIds: [AREA_IDS.ventas] });
      const first = await repo.claimForProcessing(seeded.versionId, 180);
      expect(first.acquired).toBe(true);
      const before = await prisma.documentVersion.findUniqueOrThrow({ where: { id: seeded.versionId } });

      // Simular vencimiento del lease en reloj de PostgreSQL
      await prisma.$executeRaw`
        UPDATE document_versions
           SET lease_expires_at = now() - interval '5 seconds'
         WHERE id = ${seeded.versionId}::uuid`;

      const second = await repo.claimForProcessing(seeded.versionId, 180);
      expect(second.acquired).toBe(true);
      if (first.acquired && second.acquired) {
        expect(second.claimToken).not.toBe(first.claimToken);
      }
      const after = await prisma.documentVersion.findUniqueOrThrow({ where: { id: seeded.versionId } });
      expect(after.processingStartedAt!.getTime()).toBeGreaterThanOrEqual(before.processingStartedAt!.getTime());
    });

    it('heartbeat válido renueva el lease; con token incorrecto o lease vencido no modifica el registro', async () => {
      const seeded = await seedDocument(prisma, { areaIds: [AREA_IDS.ventas] });
      const claim = await repo.claimForProcessing(seeded.versionId, 60);
      if (!claim.acquired) throw new Error('Expected claim');

      const before = await prisma.documentVersion.findUniqueOrThrow({ where: { id: seeded.versionId } });
      expect(await repo.renewLease(seeded.versionId, '00000000-0000-4000-8000-000000000000', 180)).toBe(false);
      expect(await repo.renewLease(seeded.versionId, claim.claimToken, 180)).toBe(true);

      const after = await prisma.documentVersion.findUniqueOrThrow({ where: { id: seeded.versionId } });
      expect(after.leaseExpiresAt!.getTime()).toBeGreaterThan(before.leaseExpiresAt!.getTime());

      await prisma.$executeRaw`
        UPDATE document_versions
           SET lease_expires_at = now() - interval '1 second'
         WHERE id = ${seeded.versionId}::uuid`;
      expect(await repo.renewLease(seeded.versionId, claim.claimToken, 180)).toBe(false);
    });

    it('releaseClaim limpia campos con token válido y no modifica con token incorrecto', async () => {
      const seeded = await seedDocument(prisma, { areaIds: [AREA_IDS.ventas] });
      const claim = await repo.claimForProcessing(seeded.versionId, 180);
      if (!claim.acquired) throw new Error('Expected claim');

      expect(await repo.releaseClaim(seeded.versionId, '00000000-0000-4000-8000-000000000000')).toBe(false);
      expect(await repo.releaseClaim(seeded.versionId, claim.claimToken)).toBe(true);

      const row = await prisma.documentVersion.findUniqueOrThrow({ where: { id: seeded.versionId } });
      expect(row.processingStatus).toBe('PENDING');
      expect(row.claimToken).toBeNull();
      expect(row.leaseExpiresAt).toBeNull();
      expect(row.processingStartedAt).toBeNull();
    });

    it('fencing: ejecución antigua no puede confirmar commitLocked ni marcar FAILED tras perder el claim', async () => {
      const seeded = await seedDocument(prisma, { areaIds: [AREA_IDS.ventas] });
      const oldClaim = await repo.claimForProcessing(seeded.versionId, 180);
      if (!oldClaim.acquired) throw new Error('Expected claim');

      await prisma.$executeRaw`
        UPDATE document_versions
           SET lease_expires_at = now() - interval '5 seconds'
         WHERE id = ${seeded.versionId}::uuid`;

      const newClaim = await repo.claimForProcessing(seeded.versionId, 180);
      if (!newClaim.acquired) throw new Error('Expected new claim');

      expect(await repo.commitLocked(seeded.versionId, plan, oldClaim.claimToken)).toBe('stale');
      expect(await repo.markFailed(seeded.versionId, 'tardío', oldClaim.claimToken)).toBe(false);
      expect(await repo.commitLocked(seeded.versionId, plan, newClaim.claimToken)).toBe('ready');

      const row = await prisma.documentVersion.findUniqueOrThrow({ where: { id: seeded.versionId } });
      expect(row.processingStatus).toBe('READY');
      expect(row.claimToken).toBeNull();
      expect(row.leaseExpiresAt).toBeNull();
    });

    it('prepareReconciliation recupera PROCESSING con lease vencido y respeta lease vigente', async () => {
      const seeded = await seedDocument(prisma, { areaIds: [AREA_IDS.ventas] });
      const claim = await repo.claimForProcessing(seeded.versionId, 180);
      if (!claim.acquired) throw new Error('Expected claim');

      const activeRes = await repo.prepareReconciliation(seeded.versionId, 120);
      expect(activeRes).toEqual({ action: 'skip' });

      await prisma.$executeRaw`
        UPDATE document_versions
           SET lease_expires_at = now() - interval '5 seconds'
         WHERE id = ${seeded.versionId}::uuid`;

      const expiredRes = await repo.prepareReconciliation(seeded.versionId, 120);
      expect(expiredRes).toEqual({ action: 'enqueue', previousStatus: 'PROCESSING' });

      const row = await prisma.documentVersion.findUniqueOrThrow({ where: { id: seeded.versionId } });
      expect(row.processingStatus).toBe('PENDING');
      expect(row.claimToken).toBeNull();
      expect(row.leaseExpiresAt).toBeNull();
    });

    it('commitLocked rechaza un claimToken coincidente si el lease ya venció en PostgreSQL', async () => {
      const seeded = await seedDocument(prisma, { areaIds: [AREA_IDS.ventas] });
      const claim = await repo.claimForProcessing(seeded.versionId, 180);
      if (!claim.acquired) throw new Error('Expected claim');

      await prisma.$executeRaw`
        UPDATE document_versions
           SET lease_expires_at = now() - interval '2 seconds'
         WHERE id = ${seeded.versionId}::uuid`;

      const outcome = await repo.commitLocked(seeded.versionId, plan, claim.claimToken);

      expect(outcome).toBe('stale');
      expect(await prisma.chunk.count({ where: { documentVersionId: seeded.versionId } })).toBe(0);
      const row = await prisma.documentVersion.findUniqueOrThrow({ where: { id: seeded.versionId } });
      expect(row.processingStatus).toBe('PROCESSING');
    });

    it('dos commitLocked concurrentes con el mismo token: uno confirma READY y el otro devuelve stale sin duplicar chunks', async () => {
      const seeded = await seedDocument(prisma, { areaIds: [AREA_IDS.ventas] });
      const claim = await repo.claimForProcessing(seeded.versionId, 180);
      if (!claim.acquired) throw new Error('Expected claim');

      const [r1, r2] = await Promise.all([
        repo.commitLocked(seeded.versionId, plan, claim.claimToken),
        repo.commitLocked(seeded.versionId, plan, claim.claimToken),
      ]);

      expect([r1, r2].sort()).toEqual(['ready', 'stale']);
      expect(await prisma.chunk.count({ where: { documentVersionId: seeded.versionId } })).toBe(1);
    });

    it('prepareReconciliation devuelve locked_by_other cuando otra conexión mantiene el advisory lock', async () => {
      const seeded = await seedDocument(prisma, { areaIds: [AREA_IDS.ventas] });
      await prisma.$executeRaw`
        UPDATE document_versions
           SET created_at = now() - interval '5 minutes'
         WHERE id = ${seeded.versionId}::uuid`;

      let releaseLock!: () => void;
      const gate = new Promise<void>((resolve) => {
        releaseLock = resolve;
      });
      let lockAcquired!: () => void;
      const acquiredSignal = new Promise<void>((resolve) => {
        lockAcquired = resolve;
      });

      const holder = prisma.$transaction(async (tx) => {
        const [{ acquired }] = await tx.$queryRaw<{ acquired: boolean }[]>`
          SELECT pg_try_advisory_xact_lock(hashtext('pispiar-reconcile'), hashtext(${seeded.versionId})) AS acquired`;
        expect(acquired).toBe(true);
        lockAcquired();
        await gate;
      });

      await acquiredSignal;
      const concurrent = await repo.prepareReconciliation(seeded.versionId, 120);
      expect(concurrent).toEqual({ action: 'locked_by_other' });

      releaseLock();
      await holder;

      const afterRelease = await repo.prepareReconciliation(seeded.versionId, 120);
      expect(afterRelease).toEqual({ action: 'enqueue', previousStatus: 'PENDING' });
    });
  });
});