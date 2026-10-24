/* Ciclo de vida de punta a punta (spec 003): cambiar áreas y archivar (T14) */

import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AREA_IDS, FIXTURE_USERS } from '../../src/documents/adapters/fixtures';
import {
  DocumentsTestApp,
  SeededDocument,
  authHeaders,
  cleanDocuments,
  createDocumentsTestApp,
  seedDocument,
  seedProcessedVersion,
} from './helpers';

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
});
