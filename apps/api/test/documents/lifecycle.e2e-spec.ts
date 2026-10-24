/* Ciclo de vida de punta a punta (spec 003): cambiar áreas y archivar (T14) y versión nueva (T15) */

import { createHash, randomUUID } from 'node:crypto';
import request from 'supertest';
import { AREA_IDS, FIXTURE_USERS } from '../../src/documents/adapters/fixtures';
import {
  DocumentsTestApp,
  SeededDocument,
  authHeaders,
  cleanDocuments,
  createDocumentsTestApp,
  daysFromToday,
  pdfOfSize,
  seedDocument,
  seedProcessedVersion,
} from './helpers';

// Un PDF distinto en cada llamada (otro checksum), y su SHA-256.
const uniquePdf = () =>
  Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.from(randomUUID())]);
const sha256 = (buffer: Buffer) =>
  createHash('sha256').update(buffer).digest('hex');

interface VersionResponseBody {
  id: string;
  status: string;
  reviewDate: string;
  currentVersion: {
    id: string;
    versionNumber: number;
    status: string;
    processingStatus: string;
  };
}

interface ErrorBody {
  statusCode: number;
  message: string | string[];
  reason?: string;
}

interface DocumentBody {
  id: string;
  status: string;
  areaIds: string[];
  ownerId: string;
  archivedAt: string | null;
}

const messages = (body: ErrorBody) => ([] as string[]).concat(body.message);

describe('Ciclo de vida de documentos (integración)', () => {
  let t: DocumentsTestApp;
  // Un documento de Ventas con dos versiones procesadas: v1 REPLACED y v2 CURRENT.
  let ventas: SeededDocument;
  let v2Id: string;

  const admin = authHeaders(FIXTURE_USERS.admin);
  const empleadoVentas = authHeaders(FIXTURE_USERS.empleadoVentas);
  const empleadoOperaciones = authHeaders(FIXTURE_USERS.empleadoOperaciones);
  const http = () => request(t.app.getHttpServer());

  const documentAreas = async (documentId: string) =>
    (
      await t.prisma.documentArea.findMany({
        where: { documentId },
        select: { areaId: true },
      })
    ).map((row) => row.areaId);
  const chunks = (documentId: string) =>
    t.prisma.chunk.findMany({
      where: { documentId },
      select: { documentVersionId: true, areaIds: true, isActive: true },
    });

  // Como haría la versión nueva (T07), pero a mano: la v1 pasa a REPLACED con sus fragmentos
  // inactivos y se crea una v2 CURRENT, procesada.
  async function addProcessedSecondVersion(
    doc: SeededDocument,
  ): Promise<string> {
    const id = randomUUID();
    await t.prisma.documentVersion.update({
      where: { id: doc.versionId },
      data: { status: 'REPLACED' },
    });
    await t.prisma.chunk.updateMany({
      where: { documentVersionId: doc.versionId },
      data: { isActive: false },
    });
    await t.prisma.documentVersion.create({
      data: {
        id,
        documentId: doc.id,
        versionNumber: 2,
        storageKey: `documents/${doc.id}/${id}.pdf`,
        originalFileName: 'documento v2.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 2048,
        checksum: randomUUID().replace(/-/g, '').padEnd(64, '1'),
        uploadedById: FIXTURE_USERS.admin.id,
      },
    });
    await seedProcessedVersion(t.prisma, {
      documentId: doc.id,
      versionId: id,
      areaIds: [AREA_IDS.ventas],
    });
    return id;
  }

  beforeAll(async () => {
    t = await createDocumentsTestApp();
  });

  afterAll(async () => {
    await t.app.close();
  });

  beforeEach(async () => {
    await cleanDocuments(t.prisma);
    ventas = await seedDocument(t.prisma, {
      title: 'Caja',
      areaIds: [AREA_IDS.ventas],
    });
    await seedProcessedVersion(t.prisma, {
      documentId: ventas.id,
      versionId: ventas.versionId,
      areaIds: [AREA_IDS.ventas],
    });
    v2Id = await addProcessedSecondVersion(ventas);
  });

  describe('PATCH /api/documents/:id/areas', () => {
    const path = (id: string) => `/api/documents/${id}/areas`;

    it('E1: pasa a Operaciones, con los fragmentos de todas las versiones, y cambia quién lo ve', async () => {
      const res = await http()
        .patch(path(ventas.id))
        .set(admin)
        .send({ areaIds: [AREA_IDS.operaciones] })
        .expect(200);

      expect(res.body as DocumentBody).toMatchObject({
        id: ventas.id,
        areaIds: [AREA_IDS.operaciones],
      });
      expect(await documentAreas(ventas.id)).toEqual([AREA_IDS.operaciones]);
      const rows = await chunks(ventas.id);
      expect(new Set(rows.map((row) => row.documentVersionId))).toEqual(
        new Set([ventas.versionId, v2Id]),
      );
      for (const row of rows)
        expect(row.areaIds).toEqual([AREA_IDS.operaciones]);

      await http()
        .get(`/api/documents/${ventas.id}`)
        .set(empleadoVentas)
        .expect(404);
      const listVentas = await http()
        .get('/api/documents')
        .set(empleadoVentas)
        .expect(200);
      expect((listVentas.body as { data: unknown[] }).data).toEqual([]);

      await http()
        .get(`/api/documents/${ventas.id}`)
        .set(empleadoOperaciones)
        .expect(200);
      const listOperaciones = await http()
        .get('/api/documents')
        .set(empleadoOperaciones)
        .expect(200);
      expect(
        (listOperaciones.body as { data: { id: string }[] }).data.map(
          (d) => d.id,
        ),
      ).toEqual([ventas.id]);
    });

    it('E1 con responsable nuevo en la misma operación (P2)', async () => {
      const res = await http()
        .patch(path(ventas.id))
        .set(admin)
        .send({
          areaIds: [AREA_IDS.operaciones],
          ownerId: FIXTURE_USERS.supervisorOperaciones.id,
        })
        .expect(200);

      expect((res.body as DocumentBody).ownerId).toBe(
        FIXTURE_USERS.supervisorOperaciones.id,
      );
    });

    it('E6: el responsable perdería el acceso → 400 ownerId y no cambia nada', async () => {
      await t.prisma.document.update({
        where: { id: ventas.id },
        data: { ownerId: FIXTURE_USERS.supervisorVentas.id },
      });
      const before = await chunks(ventas.id);

      const res = await http()
        .patch(path(ventas.id))
        .set(admin)
        .send({ areaIds: [AREA_IDS.operaciones] })
        .expect(400);

      expect(messages(res.body as ErrorBody)).toEqual([
        expect.stringMatching(/^ownerId: /),
      ]);
      expect(await documentAreas(ventas.id)).toEqual([AREA_IDS.ventas]);
      expect(await chunks(ventas.id)).toEqual(before);
    });

    it('un área inexistente → 400 areaIds', async () => {
      const res = await http()
        .patch(path(ventas.id))
        .set(admin)
        .send({ areaIds: [randomUUID()] })
        .expect(400);

      expect(messages(res.body as ErrorBody)).toEqual([
        expect.stringMatching(/^areaIds: /),
      ]);
    });

    it('areaIds vacío → 400', async () => {
      await http()
        .patch(path(ventas.id))
        .set(admin)
        .send({ areaIds: [] })
        .expect(400);
    });
  });

  describe('POST /api/documents/:id/archive', () => {
    const path = (id: string) => `/api/documents/${id}/archive`;

    it('E7: 200 ARCHIVED con archivedAt, fragmentos inactivos; el EMPLOYEE deja de verlo y el ADMIN no', async () => {
      const res = await http().post(path(ventas.id)).set(admin).expect(200);

      const body = res.body as DocumentBody;
      expect(body.status).toBe('ARCHIVED');
      expect(body.archivedAt).toEqual(expect.any(String));
      expect(Number.isNaN(Date.parse(body.archivedAt as string))).toBe(false);
      const rows = await chunks(ventas.id);
      expect(rows).toHaveLength(4);
      for (const row of rows) expect(row.isActive).toBe(false);

      await http()
        .get(`/api/documents/${ventas.id}`)
        .set(empleadoVentas)
        .expect(404);
      const detail = await http()
        .get(`/api/documents/${ventas.id}`)
        .set(admin)
        .expect(200);
      expect((detail.body as DocumentBody).status).toBe('ARCHIVED');
    });
  });

  describe('E8 (parte): un EMPLOYEE no puede', () => {
    it.each([
      ['cambiar áreas', 'patch', 'areas'],
      ['archivar', 'post', 'archive'],
    ] as const)('%s: 403 y nada cambia', async (_name, method, action) => {
      const before = await chunks(ventas.id);

      await http()
        [method](`/api/documents/${ventas.id}/${action}`)
        .set(empleadoVentas)
        .send({ areaIds: [AREA_IDS.operaciones] })
        .expect(403);

      const document = await t.prisma.document.findUniqueOrThrow({
        where: { id: ventas.id },
      });
      expect(document.status).toBe('ACTIVE');
      expect(await documentAreas(ventas.id)).toEqual([AREA_IDS.ventas]);
      expect(await chunks(ventas.id)).toEqual(before);
    });
  });

  describe('E9 (parte): sobre un documento archivado', () => {
    beforeEach(async () => {
      await http()
        .post(`/api/documents/${ventas.id}/archive`)
        .set(admin)
        .expect(200);
    });

    it('cambiar áreas → 409 ARCHIVED', async () => {
      const res = await http()
        .patch(`/api/documents/${ventas.id}/areas`)
        .set(admin)
        .send({ areaIds: [AREA_IDS.operaciones] })
        .expect(409);

      expect((res.body as ErrorBody).reason).toBe('ARCHIVED');
      expect(await documentAreas(ventas.id)).toEqual([AREA_IDS.ventas]);
    });

    it('volver a archivar → 409 ARCHIVED', async () => {
      const res = await http()
        .post(`/api/documents/${ventas.id}/archive`)
        .set(admin)
        .expect(409);

      expect((res.body as ErrorBody).reason).toBe('ARCHIVED');
    });
  });

  describe('errores comunes', () => {
    it.each([
      ['cambiar áreas', 'patch', 'areas'],
      ['archivar', 'post', 'archive'],
    ] as const)(
      '%s: sin sesión 401, id mal formado 400, inexistente 404',
      async (_name, method, action) => {
        const body = { areaIds: [AREA_IDS.operaciones] };

        await http()
          [method](`/api/documents/${ventas.id}/${action}`)
          .send(body)
          .expect(401);
        await http()
          [method](`/api/documents/no-es-uuid/${action}`)
          .set(admin)
          .send(body)
          .expect(400);
        await http()
          [method](`/api/documents/${randomUUID()}/${action}`)
          .set(admin)
          .send(body)
          .expect(404);
      },
    );
  });

  describe('POST /api/documents/:id/versions', () => {
    // Un documento de Ventas con una sola versión, procesada y con su archivo en el almacenamiento.
    let caja: SeededDocument;
    let v1File: Buffer;
    let put: jest.SpyInstance;

    const postVersion = (
      id: string,
      file: Buffer,
      opts: { filename?: string; reviewDate?: string } = {},
    ) => {
      const req = http()
        .post(`/api/documents/${id}/versions`)
        .attach('file', file, {
          filename: opts.filename ?? 'manual v2.pdf',
          contentType: 'application/pdf',
        });
      return opts.reviewDate ? req.field('reviewDate', opts.reviewDate) : req;
    };
    const versions = (documentId: string) =>
      t.prisma.documentVersion.findMany({
        where: { documentId },
        orderBy: { versionNumber: 'asc' },
      });

    beforeEach(async () => {
      v1File = uniquePdf();
      caja = await seedDocument(t.prisma, {
        title: 'Caja diaria',
        areaIds: [AREA_IDS.ventas],
        checksum: sha256(v1File),
      });
      await seedProcessedVersion(t.prisma, {
        documentId: caja.id,
        versionId: caja.versionId,
        areaIds: [AREA_IDS.ventas],
      });
      await t.storage.put(
        caja.storageKey,
        v1File,
        'application/pdf',
        sha256(v1File),
      );
      t.queue.enqueued.length = 0;
      put = jest.spyOn(t.storage, 'put');
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('E2: 201; v1 REPLACED con fragmentos inactivos, v2 CURRENT y PENDING, encolada; los dos archivos quedan', async () => {
      const res = await postVersion(caja.id, uniquePdf())
        .set(admin)
        .expect(201);

      const body = res.body as VersionResponseBody;
      expect(body.currentVersion).toMatchObject({
        versionNumber: 2,
        status: 'CURRENT',
        processingStatus: 'PENDING',
      });
      expect(JSON.stringify(body)).not.toMatch(/storageKey|checksum/);

      const [v1, v2] = await versions(caja.id);
      expect(v1).toMatchObject({ id: caja.versionId, status: 'REPLACED' });
      expect(v2).toMatchObject({
        id: body.currentVersion.id,
        versionNumber: 2,
        status: 'CURRENT',
        processingStatus: 'PENDING',
        storageKey: `documents/${caja.id}/${body.currentVersion.id}.pdf`,
      });
      for (const row of await chunks(caja.id)) {
        expect(row.isActive).toBe(false);
      }
      expect(t.queue.enqueued).toEqual([v2.id]);
      expect(t.storage.has(v2.storageKey)).toBe(true);
      expect(t.storage.has(caja.storageKey)).toBe(true);
    });

    it('E3: igual a la vigente → 409 IDENTICAL_TO_CURRENT, una sola versión y ningún objeto nuevo', async () => {
      const res = await postVersion(caja.id, v1File).set(admin).expect(409);

      expect(res.body as ErrorBody).toMatchObject({
        message: 'El archivo es igual a la versión vigente',
        reason: 'IDENTICAL_TO_CURRENT',
      });
      expect(await versions(caja.id)).toHaveLength(1);
      expect(put).not.toHaveBeenCalled();
      expect(t.queue.enqueued).toEqual([]);
    });

    it('E4: con reviewDate futura el documento la toma; sin ella queda la anterior', async () => {
      const reviewDate = daysFromToday(60);

      const withDate = await postVersion(caja.id, uniquePdf(), { reviewDate })
        .set(admin)
        .expect(201);
      expect((withDate.body as VersionResponseBody).reviewDate).toBe(
        reviewDate,
      );

      const withoutDate = await postVersion(caja.id, uniquePdf())
        .set(admin)
        .expect(201);
      expect((withoutDate.body as VersionResponseBody).reviewDate).toBe(
        reviewDate,
      );
      expect(
        (withoutDate.body as VersionResponseBody).currentVersion.versionNumber,
      ).toBe(3);
    });

    it('reviewDate de hoy → 400', async () => {
      await postVersion(caja.id, uniquePdf(), { reviewDate: daysFromToday(0) })
        .set(admin)
        .expect(400);

      expect(await versions(caja.id)).toHaveLength(1);
    });

    it('E5: falla la cola → 503; v1 sigue CURRENT con sus fragmentos activos, sin v2 ni objeto nuevo', async () => {
      t.queue.failNext();

      await postVersion(caja.id, uniquePdf()).set(admin).expect(503);

      const rows = await versions(caja.id);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ id: caja.versionId, status: 'CURRENT' });
      for (const row of await chunks(caja.id)) {
        expect(row.isActive).toBe(true);
      }
      const [newKey] = put.mock.calls[0] as [string];
      expect(newKey).not.toBe(caja.storageKey);
      expect(t.storage.has(newKey)).toBe(false);
      expect(t.storage.has(caja.storageKey)).toBe(true);
    });

    it('E10: dos versiones a la vez → las dos 201, versiones 2 y 3 y una sola CURRENT', async () => {
      const [first, second] = await Promise.all([
        postVersion(caja.id, uniquePdf()).set(admin),
        postVersion(caja.id, uniquePdf()).set(admin),
      ]);

      expect([first.status, second.status]).toEqual([201, 201]);
      const rows = await versions(caja.id);
      expect(rows.map((row) => row.versionNumber)).toEqual([1, 2, 3]);
      expect(rows.filter((row) => row.status === 'CURRENT')).toHaveLength(1);
      expect(rows[2].status).toBe('CURRENT');
    });

    it('archivar y subir una versión a la vez: termina ARCHIVED, una sola CURRENT y fragmentos inactivos', async () => {
      const [version, archive] = await Promise.all([
        postVersion(caja.id, uniquePdf()).set(admin),
        http().post(`/api/documents/${caja.id}/archive`).set(admin),
      ]);

      expect(archive.status).toBe(200);
      // Según quién tome el bloqueo primero: la versión entra antes de archivar, o llega tarde.
      expect([201, 409]).toContain(version.status);
      const document = await t.prisma.document.findUniqueOrThrow({
        where: { id: caja.id },
      });
      expect(document.status).toBe('ARCHIVED');
      const rows = await versions(caja.id);
      expect(rows.filter((row) => row.status === 'CURRENT')).toHaveLength(1);
      for (const row of await chunks(caja.id)) {
        expect(row.isActive).toBe(false);
      }
    });

    it('E8 (parte): un EMPLOYEE → 403 y nada cambia', async () => {
      await postVersion(caja.id, uniquePdf()).set(empleadoVentas).expect(403);

      expect(await versions(caja.id)).toHaveLength(1);
      expect(put).not.toHaveBeenCalled();
    });

    it('E9 (parte): sobre un documento archivado → 409 ARCHIVED', async () => {
      await http()
        .post(`/api/documents/${caja.id}/archive`)
        .set(admin)
        .expect(200);

      const res = await postVersion(caja.id, uniquePdf())
        .set(admin)
        .expect(409);

      expect((res.body as ErrorBody).reason).toBe('ARCHIVED');
      expect(put).not.toHaveBeenCalled();
    });

    it('igual a la vigente de otro documento → 409 DUPLICATE con existingDocumentId', async () => {
      const other = uniquePdf();
      const otro = await seedDocument(t.prisma, {
        title: 'Otro',
        areaIds: [AREA_IDS.operaciones],
        checksum: sha256(other),
      });

      const res = await postVersion(caja.id, other).set(admin).expect(409);

      expect(res.body as ErrorBody).toMatchObject({
        reason: 'DUPLICATE',
        existingDocumentId: otro.id,
      });
    });

    it('11 MB → 413', async () => {
      await postVersion(caja.id, pdfOfSize(11 * 1024 * 1024))
        .set(admin)
        .expect(413);

      expect(put).not.toHaveBeenCalled();
    });

    it('extensión falsa → 415', async () => {
      await postVersion(caja.id, Buffer.from('no soy un PDF'), {
        filename: 'manual.pdf',
      })
        .set(admin)
        .expect(415);

      expect(put).not.toHaveBeenCalled();
    });

    it('sin sesión 401, id mal formado 400, inexistente 404', async () => {
      await postVersion(caja.id, uniquePdf()).expect(401);
      await postVersion('no-es-uuid', uniquePdf()).set(admin).expect(400);
      await postVersion(randomUUID(), uniquePdf()).set(admin).expect(404);
    });
  });

  describe('GET /api/documents/:id/versions y /versions/:versionId/download', () => {
    // `ventas` ya tiene v1 REPLACED y v2 CURRENT; la v3 se sube por la API.
    let v3Id: string;

    const history = (id: string) => http().get(`/api/documents/${id}/versions`);
    const download = (id: string, versionId: string) =>
      http().get(`/api/documents/${id}/versions/${versionId}/download`);

    beforeEach(async () => {
      const res = await http()
        .post(`/api/documents/${ventas.id}/versions`)
        .set(admin)
        .attach('file', uniquePdf(), {
          filename: 'caja v3.pdf',
          contentType: 'application/pdf',
        })
        .expect(201);
      v3Id = (res.body as VersionResponseBody).currentVersion.id;
      t.storage.generatedLinks.length = 0;
    });

    it('E13: el historial va de la 3 a la 1, con su estado y sin storageKey ni checksum', async () => {
      const res = await history(ventas.id).set(admin).expect(200);

      const body = res.body as {
        data: Record<string, unknown>[];
      };
      expect(
        body.data.map(({ id, versionNumber, status }) => ({
          id,
          versionNumber,
          status,
        })),
      ).toEqual([
        { id: v3Id, versionNumber: 3, status: 'CURRENT' },
        { id: v2Id, versionNumber: 2, status: 'REPLACED' },
        { id: ventas.versionId, versionNumber: 1, status: 'REPLACED' },
      ]);
      expect(body.data[0]).toEqual({
        id: v3Id,
        versionNumber: 3,
        status: 'CURRENT',
        originalFileName: 'caja v3.pdf',
        mimeType: 'application/pdf',
        sizeBytes: expect.any(Number) as number,
        processingStatus: 'PENDING',
        uploadedById: FIXTURE_USERS.admin.id,
        createdAt: expect.any(String) as string,
      });
      expect(JSON.stringify(body)).not.toMatch(/storageKey|checksum/);
    });

    it('E13: la descarga de cada versión da url y expiresAt, para la clave de esa versión', async () => {
      for (const versionId of [ventas.versionId, v2Id, v3Id]) {
        const res = await download(ventas.id, versionId).set(admin).expect(200);

        expect(res.body).toEqual({
          url: expect.any(String) as string,
          expiresAt: expect.any(String) as string,
        });
      }
      const keys = t.storage.generatedLinks.map((link) => link.key);
      expect(keys).toHaveLength(3);
      expect(keys[0]).toBe(ventas.storageKey);
      expect(keys[2]).toBe(`documents/${ventas.id}/${v3Id}.pdf`);
    });

    it('E12: un EMPLOYEE → 403 en los dos endpoints, aunque el documento no exista', async () => {
      await history(ventas.id).set(empleadoVentas).expect(403);
      await download(ventas.id, v3Id).set(empleadoVentas).expect(403);
      await history(randomUUID()).set(empleadoVentas).expect(403);
      await download(randomUUID(), randomUUID())
        .set(empleadoVentas)
        .expect(403);
      expect(t.storage.generatedLinks).toEqual([]);
    });

    it('una versión de otro documento → 404 y no se genera enlace', async () => {
      const otro = await seedDocument(t.prisma, {
        title: 'Otro',
        areaIds: [AREA_IDS.ventas],
      });

      await download(ventas.id, otro.versionId).set(admin).expect(404);
      expect(t.storage.generatedLinks).toEqual([]);
    });

    it('un documento inexistente → 404 en el historial', async () => {
      await history(randomUUID()).set(admin).expect(404);
    });

    it('D10: con el documento archivado, el ADMIN sigue viendo el historial y descargando', async () => {
      await http()
        .post(`/api/documents/${ventas.id}/archive`)
        .set(admin)
        .expect(200);

      const res = await history(ventas.id).set(admin).expect(200);
      expect((res.body as { data: unknown[] }).data).toHaveLength(3);
      await download(ventas.id, ventas.versionId).set(admin).expect(200);
    });

    it('sin sesión 401; ids mal formados 400', async () => {
      await history(ventas.id).expect(401);
      await history('no-es-uuid').set(admin).expect(400);
      await download(ventas.id, 'no-es-uuid').set(admin).expect(400);
      await download('no-es-uuid', v3Id).set(admin).expect(400);
    });
  });
});
