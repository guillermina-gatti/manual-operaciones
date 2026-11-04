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

    const outcome = await repo.commitLocked(seeded.versionId, plan);

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

    await repo.commitLocked(seeded.versionId, plan);

    const chunks = await prisma.chunk.findMany({ where: { documentVersionId: seeded.versionId } });
    expect(chunks.every((c) => c.isActive === false)).toBe(true);
    const version = await prisma.documentVersion.findUniqueOrThrow({ where: { id: seeded.versionId } });
    expect(version.processingStatus).toBe('READY');
  });

  it('versión inexistente: descarta sin guardar nada', async () => {
    const outcome = await repo.commitLocked('00000000-0000-4000-8000-000000000000', plan);

    expect(outcome).toBe('discarded');
    expect(await prisma.chunk.count()).toBe(0);
  });

  it('reintentar el commit no duplica fragmentos', async () => {
    const seeded = await seedDocument(prisma, { areaIds: [AREA_IDS.ventas] });

    await repo.commitLocked(seeded.versionId, plan);
    await repo.commitLocked(seeded.versionId, plan);

    expect(await prisma.chunk.count({ where: { documentVersionId: seeded.versionId } })).toBe(1);
  });

  it('markFailed deja la versión FAILED con el motivo', async () => {
    const seeded = await seedDocument(prisma, { areaIds: [AREA_IDS.ventas] });

    await repo.markFailed(seeded.versionId, 'El PDF no tiene texto extraíble');

    const version = await prisma.documentVersion.findUniqueOrThrow({ where: { id: seeded.versionId } });
    expect(version.processingStatus).toBe('FAILED');
    expect(version.processingError).toBe('El PDF no tiene texto extraíble');
  });

  it('cambio de áreas concurrente: el worker espera el lock y guarda las áreas nuevas', async () => {
    const seeded = await seedDocument(prisma, { areaIds: [AREA_IDS.ventas] });

    // Operación de Matías: toma FOR UPDATE, cambia las áreas y mantiene la transacción abierta.
    const holder = prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM documents WHERE id = ${seeded.id}::uuid FOR UPDATE`;
      await tx.$executeRaw`
        UPDATE document_areas SET area_id = ${AREA_IDS.operaciones}::uuid
         WHERE document_id = ${seeded.id}::uuid`;
      await new Promise((resolve) => setTimeout(resolve, 800));
    });
    await new Promise((resolve) => setTimeout(resolve, 200)); // el worker llega mientras está tomado
    const commit = repo.commitLocked(seeded.versionId, plan);

    await Promise.all([holder, commit]);

    const chunks = await prisma.chunk.findMany({ where: { documentVersionId: seeded.versionId } });
    expect(chunks[0].areaIds).toEqual([AREA_IDS.operaciones]);
  });
});