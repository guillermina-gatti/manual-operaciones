/* Spec 003 (T29): casos borde del ciclo de vida con el worker real (sección 8 de la spec; R7, R10;
   Q1 y plan 3.4). El ADMIN opera con DocumentLifecycleService de verdad (por HTTP) y el worker es el
   de Guille (ProcessDocumentHandler, ProcessingService y PrismaProcessingRepository), sin BullMQ: el
   test le pasa el trabajo. Los embeddings son falsos y con compuerta (GatedEmbeddings): el worker
   se detiene después de extraer y fragmentar, antes de su transacción, y el test elige el orden.
   - Caso 1: versión nueva mientras la anterior se procesa → los fragmentos de la anterior quedan
     inactivos (los guarda el worker, o los apaga la versión nueva).
   - Caso 3: archivar mientras se procesa → los fragmentos quedan inactivos.
   El caso 2 (cambiar las áreas mientras se procesa) lo cubre Guille contra el lock en
   test/processing/prisma-processing.repository.e2e-spec.ts. Además, A3 del plan 001: un trabajo
   cuya versión no existe se reintenta y, en el último intento, se descarta sin error. */

import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AREA_IDS, FIXTURE_USERS } from '../../src/documents/adapters/fixtures';
import { buildPdf } from '../../src/processing/pdf-fixture';
import { VersionNotFoundError } from '../../src/processing/processing.service';
import {
  DocumentsTestApp,
  GatedEmbeddings,
  authHeaders,
  cleanDocuments,
  createDocumentsTestApp,
  createRealWorker,
  daysFromToday,
} from './helpers';

interface DocumentBody {
  id: string;
  status: string;
  currentVersion: { id: string; versionNumber: number; status: string };
}

// Un PDF real (el worker extrae su texto), distinto en cada llamada para no chocar con el 409 por
// archivo repetido. Solo ASCII: es lo que admite buildPdf.
const realPdf = () =>
  buildPdf([
    `Apertura de caja ${randomUUID()}`,
    'Contar el efectivo y registrar el monto inicial en la planilla.',
  ]);

describe('Ciclo de vida con el worker real (T29)', () => {
  let t: DocumentsTestApp;
  const admin = authHeaders(FIXTURE_USERS.admin);
  const http = () => request(t.app.getHttpServer());

  beforeAll(async () => {
    t = await createDocumentsTestApp();
  });

  afterAll(async () => {
    await cleanDocuments(t.prisma);
    await t.app.close();
  });

  beforeEach(async () => {
    await cleanDocuments(t.prisma);
    t.queue.enqueued.length = 0;
  });

  async function uploadDocument(): Promise<{ id: string; versionId: string }> {
    const res = await http()
      .post('/api/documents')
      .set(admin)
      .field('title', `Manual de caja ${randomUUID()}`)
      .field('areaIds', AREA_IDS.ventas)
      .field('ownerId', FIXTURE_USERS.supervisorVentas.id)
      .field('reviewDate', daysFromToday(30))
      .attach('file', realPdf(), {
        filename: 'manual.pdf',
        contentType: 'application/pdf',
      });
    expect(res.status).toBe(201);
    const body = res.body as DocumentBody;
    return { id: body.id, versionId: body.currentVersion.id };
  }

  async function uploadVersion(documentId: string): Promise<string> {
    const res = await http()
      .post(`/api/documents/${documentId}/versions`)
      .set(admin)
      .attach('file', realPdf(), {
        filename: 'manual v2.pdf',
        contentType: 'application/pdf',
      });
    expect(res.status).toBe(201);
    return (res.body as DocumentBody).currentVersion.id;
  }

  async function archive(documentId: string): Promise<void> {
    const res = await http()
      .post(`/api/documents/${documentId}/archive`)
      .set(admin);
    expect(res.status).toBe(200);
    expect((res.body as DocumentBody).status).toBe('ARCHIVED');
  }

  const chunksOf = (versionId: string) =>
    t.prisma.chunk.findMany({ where: { documentVersionId: versionId } });
  const versionOf = (versionId: string) =>
    t.prisma.documentVersion.findUniqueOrThrow({ where: { id: versionId } });
  const documentOf = (documentId: string) =>
    t.prisma.document.findUniqueOrThrow({ where: { id: documentId } });

  // Lo que tiene que quedar siempre: la versión procesada, con fragmentos (con las áreas del
  // documento) y todos en el estado de activación esperado.
  async function expectChunks(versionId: string, isActive: boolean) {
    const chunks = await chunksOf(versionId);
    expect(chunks.length).toBeGreaterThan(0);
    for (const chunk of chunks) {
      expect(chunk.isActive).toBe(isActive);
      expect(chunk.areaIds).toEqual([AREA_IDS.ventas]);
    }
  }

  // El worker procesa una versión hasta la compuerta y espera ahí.
  async function startPaused(versionId: string) {
    const gate = new GatedEmbeddings();
    const processing = createRealWorker(t, gate).process(versionId);
    await gate.reached;
    return { gate, processing };
  }

  const processNow = (versionId: string) =>
    createRealWorker(t, new GatedEmbeddings(false)).process(versionId);

  describe('caso 1: versión nueva mientras la anterior se procesa', () => {
    it('la versión nueva confirma mientras el worker procesa: los fragmentos de la anterior se guardan inactivos', async () => {
      const doc = await uploadDocument();
      const { gate, processing } = await startPaused(doc.versionId);

      const v2 = await uploadVersion(doc.id);
      // Todavía no hay fragmentos: el worker no llegó a su transacción.
      expect(await chunksOf(doc.versionId)).toHaveLength(0);
      gate.open();

      expect(await processing).toBe('ready');
      expect(await versionOf(doc.versionId)).toMatchObject({
        status: 'REPLACED',
        processingStatus: 'READY',
      });
      await expectChunks(doc.versionId, false);

      // La nueva quedó encolada y, al procesarse, sus fragmentos son los únicos activos.
      expect(t.queue.enqueued).toEqual([doc.versionId, v2]);
      expect(await processNow(v2)).toBe('ready');
      await expectChunks(v2, true);
    });

    it('el worker confirma antes que la versión nueva: la versión nueva apaga los fragmentos de la anterior', async () => {
      const doc = await uploadDocument();
      const { gate, processing } = await startPaused(doc.versionId);
      gate.open();
      expect(await processing).toBe('ready');
      await expectChunks(doc.versionId, true);

      const v2 = await uploadVersion(doc.id);

      expect(await versionOf(doc.versionId)).toMatchObject({
        status: 'REPLACED',
        processingStatus: 'READY',
      });
      await expectChunks(doc.versionId, false);
      expect(await processNow(v2)).toBe('ready');
      await expectChunks(v2, true);
    });

    it('a la vez: sea cual sea el orden en que confirman, la anterior queda inactiva', async () => {
      const doc = await uploadDocument();
      const { gate, processing } = await startPaused(doc.versionId);

      gate.open();
      const [outcome, v2] = await Promise.all([
        processing,
        uploadVersion(doc.id),
      ]);

      expect(outcome).toBe('ready');
      await expectChunks(doc.versionId, false);
      expect(await versionOf(v2)).toMatchObject({ status: 'CURRENT' });
    });
  });

  describe('caso 3: archivar mientras se procesa', () => {
    it('archivar confirma mientras el worker procesa: los fragmentos se guardan inactivos', async () => {
      const doc = await uploadDocument();
      const { gate, processing } = await startPaused(doc.versionId);

      await archive(doc.id);
      expect(await chunksOf(doc.versionId)).toHaveLength(0);
      gate.open();

      expect(await processing).toBe('ready');
      expect(await documentOf(doc.id)).toMatchObject({ status: 'ARCHIVED' });
      // Archivar no toca las versiones: la vigente sigue CURRENT, ahora procesada.
      expect(await versionOf(doc.versionId)).toMatchObject({
        status: 'CURRENT',
        processingStatus: 'READY',
      });
      await expectChunks(doc.versionId, false);
    });

    it('el worker confirma antes que el archivo: archivar apaga los fragmentos', async () => {
      const doc = await uploadDocument();
      const { gate, processing } = await startPaused(doc.versionId);
      gate.open();
      expect(await processing).toBe('ready');
      await expectChunks(doc.versionId, true);

      await archive(doc.id);

      expect(await documentOf(doc.id)).toMatchObject({ status: 'ARCHIVED' });
      await expectChunks(doc.versionId, false);
    });

    it('a la vez: sea cual sea el orden en que confirman, los fragmentos quedan inactivos', async () => {
      const doc = await uploadDocument();
      const { gate, processing } = await startPaused(doc.versionId);

      gate.open();
      const [outcome] = await Promise.all([processing, archive(doc.id)]);

      expect(outcome).toBe('ready');
      await expectChunks(doc.versionId, false);
    });
  });

  describe('A3 del plan 001: trabajo de una versión que no existe', () => {
    it('antes del último intento, el worker pide reintentar y no escribe nada', async () => {
      const missing = randomUUID();

      await expect(processNow(missing)).rejects.toBeInstanceOf(
        VersionNotFoundError,
      );
      expect(await t.prisma.chunk.count()).toBe(0);
    });

    it('en el último intento, se descarta sin error y no escribe nada', async () => {
      const missing = randomUUID();
      const worker = createRealWorker(t, new GatedEmbeddings(false));

      await expect(
        worker.process(missing, { attemptsMade: 2, attempts: 3 }),
      ).resolves.toBe('discarded');
      expect(await t.prisma.chunk.count()).toBe(0);
      expect(await t.prisma.documentVersion.count()).toBe(0);
    });
  });
});
