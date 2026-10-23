/* POST /api/documents de punta a punta (T19) */

import request from 'supertest';
import { AREA_IDS, FIXTURE_USERS } from '../../src/documents/adapters/fixtures';
import {
  DocumentsTestApp,
  authHeaders,
  cleanDocuments,
  createDocumentsTestApp,
  daysFromToday,
  pdfOfSize,
} from './helpers';

const TWO_MB = 2 * 1024 * 1024;

describe('POST /api/documents (integración)', () => {
  let t: DocumentsTestApp;
  let put: jest.SpyInstance;
  let record: jest.SpyInstance;

  beforeAll(async () => {
    t = await createDocumentsTestApp();
  });

  afterAll(async () => {
    await t.app.close();
  });

  beforeEach(async () => {
    await cleanDocuments(t.prisma);
    t.queue.enqueued.length = 0;
    put = jest.spyOn(t.storage, 'put');
    record = jest.spyOn(t.audit, 'record');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const upload = () =>
    request(t.app.getHttpServer())
      .post('/api/documents')
      .field('title', '  Manual de caja  ')
      .field('areaIds', AREA_IDS.ventas)
      .field('ownerId', FIXTURE_USERS.supervisorVentas.id)
      .field('reviewDate', daysFromToday(30))
      .attach('file', pdfOfSize(TWO_MB), {
        filename: 'manual.pdf',
        contentType: 'application/pdf',
      });

  async function expectNothingWritten() {
    expect(await t.prisma.document.count()).toBe(0);
    expect(await t.prisma.documentArea.count()).toBe(0);
    expect(await t.prisma.documentVersion.count()).toBe(0);
    expect(put).not.toHaveBeenCalled();
    expect(t.queue.enqueued).toEqual([]);
  }

  it('sin cabeceras de autenticación responde 401 y no escribe nada', async () => {
    await upload().expect(401);

    await expectNothingWritten();
  });

  it('un EMPLOYEE (rol sin permiso) recibe 403 y no escribe nada (R1)', async () => {
    await upload().set(authHeaders(FIXTURE_USERS.empleadoVentas)).expect(403);

    await expectNothingWritten();
  });

  it('carga correcta: 201, filas de plan 2.3, objeto guardado, versión encolada y auditoría SUCCESS', async () => {
    const admin = { id: FIXTURE_USERS.admin.id, role: 'ADMIN' as const };
    const reviewDate = daysFromToday(30);

    const res = await upload()
      .set(authHeaders(admin))
      .field('description', 'Cierre diario')
      .expect(201);

    // Respuesta: forma de plan 3.1, sin storageKey ni checksum.
    const body = res.body as Record<string, unknown> & {
      id: string;
      currentVersion: Record<string, unknown> & { id: string };
    };
    expect(body).toEqual({
      id: expect.any(String),
      title: 'Manual de caja',
      description: 'Cierre diario',
      status: 'ACTIVE',
      areaIds: [AREA_IDS.ventas],
      ownerId: FIXTURE_USERS.supervisorVentas.id,
      reviewDate: expect.any(String),
      createdById: admin.id,
      createdAt: expect.any(String),
      currentVersion: {
        id: expect.any(String),
        versionNumber: 1,
        status: 'CURRENT',
        originalFileName: 'manual.pdf',
        mimeType: 'application/pdf',
        sizeBytes: TWO_MB,
        processingStatus: 'PENDING',
        createdAt: expect.any(String),
      },
    });

    // Filas de plan 2.3.
    const doc = await t.prisma.document.findUniqueOrThrow({
      where: { id: body.id },
      include: { areas: true, versions: true },
    });
    expect(doc).toMatchObject({
      title: 'Manual de caja',
      status: 'ACTIVE',
      ownerId: FIXTURE_USERS.supervisorVentas.id,
      createdById: admin.id,
    });
    expect(doc.reviewDate.toISOString().slice(0, 10)).toBe(reviewDate);
    expect(doc.areas.map((a) => a.areaId)).toEqual([AREA_IDS.ventas]);
    expect(doc.versions).toHaveLength(1);
    const [version] = doc.versions;
    expect(version).toMatchObject({
      id: body.currentVersion.id,
      versionNumber: 1,
      status: 'CURRENT',
      processingStatus: 'PENDING',
      storageKey: `documents/${body.id}/${body.currentVersion.id}.pdf`,
      originalFileName: 'manual.pdf',
      mimeType: 'application/pdf',
      sizeBytes: TWO_MB,
      uploadedById: admin.id,
    });
    expect(version.checksum).toMatch(/^[0-9a-f]{64}$/);

    // Objeto en el almacenamiento, versión en la cola y auditoría.
    expect(t.storage.has(version.storageKey)).toBe(true);
    expect(t.queue.enqueued).toEqual([version.id]);
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'DOCUMENT_UPLOAD',
        actorId: admin.id,
        documentId: body.id,
        result: 'SUCCESS',
      }),
      expect.anything(),
    );
  });

  it('el endpoint aparece en /api/docs como multipart/form-data', async () => {
    const res = await request(t.app.getHttpServer())
      .get('/api/docs-json')
      .expect(200);

    const spec = res.body as {
      paths: Record<
        string,
        Record<
          string,
          {
            requestBody?: { content: Record<string, unknown> };
            responses: Record<string, unknown>;
          }
        >
      >;
    };
    const post = spec.paths['/api/documents']?.post;
    expect(post).toBeDefined();
    expect(Object.keys(post.requestBody?.content ?? {})).toEqual([
      'multipart/form-data',
    ]);
    expect(Object.keys(post.responses).sort()).toEqual(
      ['201', '400', '401', '403', '409', '413', '415', '503'].sort(),
    );
  });
});
