/* POST /api/documents de punta a punta (T19, T21) */

import { createHash, randomUUID } from 'node:crypto';
import request from 'supertest';
import { AREA_IDS, FIXTURE_USERS } from '../../src/documents/adapters/fixtures';
import { StorageUnavailableError } from '../../src/storage/file-storage';
import {
  DocumentsTestApp,
  authHeaders,
  cleanDocuments,
  createDocumentsTestApp,
  daysFromToday,
  pdfOfSize,
  seedDocument,
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

  // Escenarios de carga restantes (T21). Todos como ADMIN.
  describe('escenarios de carga', () => {
    const admin = authHeaders(FIXTURE_USERS.admin);

    interface UploadInput {
      content?: Buffer;
      filename?: string;
      contentType?: string;
      fields?: Partial<
        Record<'title' | 'areaIds' | 'ownerId' | 'reviewDate', string>
      >;
      omit?: 'title' | 'areaIds' | 'ownerId' | 'reviewDate';
    }

    // Carga con datos válidos por defecto; cada test cambia solo lo que prueba.
    const uploadAsAdmin = (input: UploadInput = {}) => {
      const fields = {
        title: 'Instructivo',
        areaIds: AREA_IDS.ventas,
        ownerId: FIXTURE_USERS.supervisorVentas.id,
        reviewDate: daysFromToday(30),
        ...input.fields,
      };
      let req = request(t.app.getHttpServer())
        .post('/api/documents')
        .set(admin);
      for (const [name, value] of Object.entries(fields)) {
        if (name !== input.omit) req = req.field(name, value);
      }
      return req.attach('file', input.content ?? pdfOfSize(1024), {
        filename: input.filename ?? 'instructivo.pdf',
        contentType: input.contentType ?? 'application/pdf',
      });
    };

    it('un nombre con tildes se guarda tal cual en originalFileName (D8)', async () => {
      const res = await uploadAsAdmin({
        filename: 'Instrucción técnica.pdf',
      }).expect(201);

      const body = res.body as {
        currentVersion: { id: string; originalFileName: string };
      };
      expect(body.currentVersion.originalFileName).toBe(
        'Instrucción técnica.pdf',
      );
      const version = await t.prisma.documentVersion.findUniqueOrThrow({
        where: { id: body.currentVersion.id },
      });
      expect(version.originalFileName).toBe('Instrucción técnica.pdf');
    });

    it('extensión falsa (texto con nombre .pdf) responde 415 y no escribe nada (R2)', async () => {
      await uploadAsAdmin({
        content: Buffer.from('esto no es un PDF'),
        filename: 'falso.pdf',
      }).expect(415);

      await expectNothingWritten();
    });

    it('un archivo de 11 MB responde 413 y no escribe nada (R3)', async () => {
      await uploadAsAdmin({ content: pdfOfSize(11 * 1024 * 1024) }).expect(413);

      await expectNothingWritten();
    });

    it('archivo duplicado responde 409 con existingDocumentId y no escribe nada nuevo (R8b)', async () => {
      const content = pdfOfSize(4096);
      const first = await uploadAsAdmin({ content }).expect(201);
      put.mockClear();
      t.queue.enqueued.length = 0;

      const res = await uploadAsAdmin({
        content,
        filename: 'otro-nombre.pdf',
        fields: { title: 'Otro título' },
      }).expect(409);

      expect(res.body).toMatchObject({
        statusCode: 409,
        existingDocumentId: (first.body as { id: string }).id,
      });
      expect(await t.prisma.document.count()).toBe(1);
      expect(await t.prisma.documentVersion.count()).toBe(1);
      expect(put).not.toHaveBeenCalled();
      expect(t.queue.enqueued).toEqual([]);
    });

    it('el mismo archivo que un documento ARCHIVED se acepta: 201 (R8b)', async () => {
      const content = pdfOfSize(4096);
      await seedDocument(t.prisma, {
        areaIds: [AREA_IDS.ventas],
        status: 'ARCHIVED',
        checksum: createHash('sha256').update(content).digest('hex'),
      });

      await uploadAsAdmin({ content }).expect(201);

      expect(await t.prisma.document.count()).toBe(2);
    });

    it('carga de Markdown responde 201 con text/markdown (R2)', async () => {
      const res = await uploadAsAdmin({
        content: Buffer.from('# Instructivo\n\nPaso 1: abrir la caja.\n'),
        filename: 'instructivo.md',
        contentType: 'text/markdown',
      }).expect(201);

      expect(res.body).toMatchObject({
        currentVersion: {
          mimeType: 'text/markdown',
          originalFileName: 'instructivo.md',
        },
      });
      const version = await t.prisma.documentVersion.findFirstOrThrow();
      expect(version.storageKey).toMatch(/\.md$/);
      expect(t.storage.has(version.storageKey)).toBe(true);
    });

    it('responsable sin acceso a las áreas del documento responde 400 y no escribe nada (R5)', async () => {
      const res = await uploadAsAdmin({
        fields: { ownerId: FIXTURE_USERS.supervisorOperaciones.id },
      }).expect(400);

      expect(JSON.stringify(res.body)).toContain('ownerId');
      await expectNothingWritten();
    });

    it('un área inexistente responde 400 y no escribe nada (R5)', async () => {
      const missingArea = randomUUID();

      const res = await uploadAsAdmin({
        fields: { areaIds: missingArea },
      }).expect(400);

      expect(JSON.stringify(res.body)).toContain(missingArea);
      await expectNothingWritten();
    });

    it('un campo obligatorio faltante responde 400 con un mensaje que lo nombra (R4)', async () => {
      const res = await uploadAsAdmin({ omit: 'ownerId' }).expect(400);

      expect(
        JSON.stringify((res.body as { message: unknown }).message),
      ).toContain('ownerId');
      await expectNothingWritten();
    });

    it('si falla el almacenamiento responde 503 y no deja filas (R8)', async () => {
      put.mockRejectedValueOnce(
        new StorageUnavailableError('S3 no responde (simulado)'),
      );

      await uploadAsAdmin().expect(503);

      expect(await t.prisma.document.count()).toBe(0);
      expect(await t.prisma.documentVersion.count()).toBe(0);
      expect(t.queue.enqueued).toEqual([]);
    });

    it('si falla el encolado responde 503, sin filas y sin el objeto (R7, R8)', async () => {
      t.queue.failNext();

      await uploadAsAdmin().expect(503);

      expect(await t.prisma.document.count()).toBe(0);
      expect(await t.prisma.documentArea.count()).toBe(0);
      expect(await t.prisma.documentVersion.count()).toBe(0);
      expect(put).toHaveBeenCalledTimes(1);
      const [storedKey] = put.mock.calls[0] as [string];
      expect(t.storage.has(storedKey)).toBe(false);
      expect(t.queue.enqueued).toEqual([]);
    });

    it('el nombre del archivo nunca se usa en la clave: ../../x.pdf (R9)', async () => {
      const res = await uploadAsAdmin({ filename: '../../x.pdf' }).expect(201);

      const body = res.body as { id: string; currentVersion: { id: string } };
      const version = await t.prisma.documentVersion.findUniqueOrThrow({
        where: { id: body.currentVersion.id },
      });
      expect(version.storageKey).toBe(
        `documents/${body.id}/${body.currentVersion.id}.pdf`,
      );
      expect(version.storageKey).not.toContain('..');
      expect(version.storageKey).not.toContain('x.pdf');
    });
  });
});
