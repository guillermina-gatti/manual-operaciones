/* Avisos de vencimiento de punta a punta (spec 005): el estado en las respuestas y "Por revisar"
(T11). El reloj de documentos está fijo en el 9/11/2026 a las 23:30 de Buenos Aires, que en UTC ya
es el 10/11: un cálculo de "hoy" en UTC haría fallar E4 (plan 005, sección 1.4, D5). */

import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AREA_IDS, FIXTURE_USERS } from '../../src/documents/adapters/fixtures';
import type { AuditEntry } from '../../src/documents/ports/audit-log';
import {
  DocumentsTestApp,
  FixedClock,
  authHeaders,
  cleanDocuments,
  createDocumentsTestApp,
  getTestFixturePasswordHash,
  seedDocument,
  seedProcessedVersion,
} from './helpers';

const NOW = new Date('2026-11-10T02:30:00.000Z');

interface ReviewBody {
  status: 'UP_TO_DATE' | 'DUE_SOON' | 'OVERDUE' | null;
  lastReviewedAt: string | null;
  lastReviewedById: string | null;
}

interface DocumentBody {
  id: string;
  reviewDate: string;
  status: string;
  review?: ReviewBody;
}

interface ListBody {
  data: DocumentBody[];
  total: number;
  page: number;
  limit: number;
}

interface PendingBody extends ListBody {
  isReviewer: boolean;
}

describe('Avisos de vencimiento (integración)', () => {
  let t: DocumentsTestApp;

  const admin = authHeaders(FIXTURE_USERS.admin);
  const empleadoVentas = authHeaders(FIXTURE_USERS.empleadoVentas);
  const supervisorVentas = authHeaders(FIXTURE_USERS.supervisorVentas);
  const http = () => request(t.app.getHttpServer());

  // Un documento de Ventas cuyo responsable es el EMPLOYEE de Ventas, con la fecha pedida.
  const seedOwned = (
    reviewDate: string,
    overrides: Partial<Parameters<typeof seedDocument>[1]> = {},
  ) =>
    seedDocument(t.prisma, {
      areaIds: [AREA_IDS.ventas],
      ownerId: FIXTURE_USERS.empleadoVentas.id,
      reviewDate,
      title: `Documento ${reviewDate}`,
      ...overrides,
    });

  const detail = async (id: string, headers: Record<string, string>) =>
    (await http().get(`/api/documents/${id}`).set(headers).expect(200))
      .body as DocumentBody;
  const list = async (headers: Record<string, string>) =>
    (await http().get('/api/documents?limit=100').set(headers).expect(200))
      .body as ListBody;
  const pending = async (headers: Record<string, string>, query = '') =>
    (
      await http()
        .get(`/api/documents/pending-review${query}`)
        .set(headers)
        .expect(200)
    ).body as PendingBody;
  const statusIn = (body: ListBody, id: string) =>
    body.data.find((document) => document.id === id)?.review?.status;

  beforeAll(async () => {
    t = await createDocumentsTestApp({ clock: new FixedClock(NOW) });
  });

  afterAll(async () => {
    await t.app.close();
  });

  beforeEach(async () => {
    await cleanDocuments(t.prisma);
  });

  describe('el estado en el listado y el detalle (R1, R4)', () => {
    it('ruta: GET /api/documents/pending-review responde 200, no el 400 del ParseUUIDPipe de :id', async () => {
      await http().get('/api/documents/pending-review').set(admin).expect(200);
    });

    it('E1: dentro de 10 días, el responsable ve DUE_SOON en el listado y en el detalle', async () => {
      const doc = await seedOwned('2026-11-19');

      expect(statusIn(await list(empleadoVentas), doc.id)).toBe('DUE_SOON');
      expect((await detail(doc.id, empleadoVentas)).review).toEqual({
        status: 'DUE_SOON',
        lastReviewedAt: null,
        lastReviewedById: null,
      });
    });

    it('E2: vencido hace 5 días, el ADMIN ve OVERDUE en el detalle', async () => {
      const doc = await seedOwned('2026-11-04');

      expect((await detail(doc.id, admin)).review?.status).toBe('OVERDUE');
    });

    it('E3: dentro de 90 días, UP_TO_DATE', async () => {
      const doc = await seedOwned('2027-02-07');

      expect(statusIn(await list(empleadoVentas), doc.id)).toBe('UP_TO_DATE');
    });

    it('E4: la fecha de hoy en Argentina es DUE_SOON (en UTC ya sería ayer y daría OVERDUE)', async () => {
      const doc = await seedOwned('2026-11-09');

      expect(statusIn(await list(empleadoVentas), doc.id)).toBe('DUE_SOON');
    });

    it('bordes: hoy + 30 está en "Por revisar" con DUE_SOON; hoy + 31 no está y es UP_TO_DATE', async () => {
      const last = await seedOwned('2026-12-09');
      const first = await seedOwned('2026-12-10');

      const body = await pending(empleadoVentas);

      expect(body.data.map((document) => document.id)).toEqual([last.id]);
      expect(body.data[0].review?.status).toBe('DUE_SOON');
      expect(statusIn(await list(empleadoVentas), first.id)).toBe('UP_TO_DATE');
    });

    it('E5: quien no es responsable no recibe la clave review, ni en el listado ni en el detalle', async () => {
      const doc = await seedDocument(t.prisma, {
        areaIds: [AREA_IDS.ventas],
        ownerId: FIXTURE_USERS.supervisorVentas.id,
        reviewDate: '2026-11-04',
      });

      const listBody = await list(empleadoVentas);
      const detailBody = await detail(doc.id, empleadoVentas);

      expect(listBody.data[0]).not.toHaveProperty('review');
      expect(detailBody).not.toHaveProperty('review');
      expect(JSON.stringify([listBody, detailBody])).not.toMatch(
        /review"|lastReviewed/,
      );
      await expect(pending(empleadoVentas)).resolves.toEqual({
        data: [],
        total: 0,
        page: 1,
        limit: 20,
        isReviewer: false,
      });
    });

    it('un archivado (con el endpoint real) tiene review.status null para el ADMIN y no está en su lista', async () => {
      const doc = await seedOwned('2026-11-04');
      await http()
        .post(`/api/documents/${doc.id}/archive`)
        .set(admin)
        .expect(200);

      expect((await detail(doc.id, admin)).review).toEqual({
        status: null,
        lastReviewedAt: null,
        lastReviewedById: null,
      });
      expect((await pending(admin)).data).toEqual([]);
    });
  });

  describe('"Por revisar" (R5)', () => {
    it('E6: vencido, por vencer y al día del mismo responsable → el vencido primero, sin el al día', async () => {
      const upToDate = await seedOwned('2027-02-07');
      const dueSoon = await seedOwned('2026-11-19');
      const overdue = await seedOwned('2026-11-04');

      const body = await pending(empleadoVentas);

      expect(body.data.map((document) => document.id)).toEqual([
        overdue.id,
        dueSoon.id,
      ]);
      expect(body.data.map((document) => document.review?.status)).toEqual([
        'OVERDUE',
        'DUE_SOON',
      ]);
      expect(body.data.map((document) => document.id)).not.toContain(
        upToDate.id,
      );
      expect(body).toMatchObject({ total: 2, isReviewer: true });
    });

    it('E7: el ADMIN ve los de distintos responsables y áreas; uno suyo aparece una sola vez', async () => {
      const ofEmployee = await seedOwned('2026-11-19');
      const ofSupervisor = await seedDocument(t.prisma, {
        areaIds: [AREA_IDS.ventas],
        ownerId: FIXTURE_USERS.supervisorVentas.id,
        reviewDate: '2026-11-20',
      });
      const ofOperations = await seedDocument(t.prisma, {
        areaIds: [AREA_IDS.operaciones],
        ownerId: FIXTURE_USERS.empleadoOperaciones.id,
        reviewDate: '2026-11-21',
      });
      const ofAdmin = await seedDocument(t.prisma, {
        areaIds: [AREA_IDS.operaciones],
        ownerId: FIXTURE_USERS.admin.id,
        reviewDate: '2026-11-22',
      });

      const body = await pending(admin);

      expect(body.data.map((document) => document.id)).toEqual([
        ofEmployee.id,
        ofSupervisor.id,
        ofOperations.id,
        ofAdmin.id,
      ]);
      expect(body.total).toBe(4);
    });

    it('varias áreas: un responsable con documentos en dos de sus áreas los ve juntos', async () => {
      // Un usuario de prueba de las dos áreas: los fixtures tienen una sola área por usuario.
      const id = randomUUID();
      await t.prisma.user.create({
        data: {
          id,
          name: 'Supervisor de dos áreas',
          email: `fixture-${id}@fixtures.test.invalid`,
          passwordHash: await getTestFixturePasswordHash(),
          role: 'SUPERVISOR',
          areas: {
            createMany: {
              data: [
                { areaId: AREA_IDS.ventas },
                { areaId: AREA_IDS.operaciones },
              ],
            },
          },
        },
      });
      try {
        const inVentas = await seedDocument(t.prisma, {
          areaIds: [AREA_IDS.ventas],
          ownerId: id,
          reviewDate: '2026-11-19',
        });
        const inOperaciones = await seedDocument(t.prisma, {
          areaIds: [AREA_IDS.operaciones],
          ownerId: id,
          reviewDate: '2026-11-04',
        });

        const body = await pending(authHeaders({ id, role: 'SUPERVISOR' }));

        expect(body.data.map((document) => document.id)).toEqual([
          inOperaciones.id,
          inVentas.id,
        ]);
      } finally {
        await cleanDocuments(t.prisma);
        await t.prisma.userArea.deleteMany({ where: { userId: id } });
        await t.prisma.user.delete({ where: { id } });
      }
    });

    it('responsable sin acceso: no está en su lista; el ADMIN lo ve con OVERDUE', async () => {
      // Lo que deja perder el acceso: un documento de Operaciones con el EMPLOYEE de Ventas de responsable.
      const doc = await seedDocument(t.prisma, {
        areaIds: [AREA_IDS.operaciones],
        ownerId: FIXTURE_USERS.empleadoVentas.id,
        reviewDate: '2026-11-04',
      });

      expect((await pending(empleadoVentas)).data).toEqual([]);
      const adminBody = await pending(admin);
      expect(adminBody.data.map((document) => document.id)).toEqual([doc.id]);
      expect(adminBody.data[0].review?.status).toBe('OVERDUE');
    });

    it('E13: responsable de documentos al día → lista vacía, pero isReviewer', async () => {
      await seedOwned('2027-02-07');
      await seedOwned('2027-03-01');

      await expect(pending(empleadoVentas)).resolves.toEqual({
        data: [],
        total: 0,
        page: 1,
        limit: 20,
        isReviewer: true,
      });
    });

    it('R5: paginado como el listado y con un orden estable', async () => {
      for (let day = 1; day <= 25; day++) {
        await seedOwned(`2026-11-${String(day).padStart(2, '0')}`);
      }

      const page2 = await pending(empleadoVentas, '?page=2&limit=20');
      const again = await pending(empleadoVentas, '?page=2&limit=20');

      expect(page2.total).toBe(25);
      expect(page2.data.map((document) => document.reviewDate)).toEqual([
        '2026-11-21',
        '2026-11-22',
        '2026-11-23',
        '2026-11-24',
        '2026-11-25',
      ]);
      expect(again.data.map((document) => document.id)).toEqual(
        page2.data.map((document) => document.id),
      );
      await http()
        .get('/api/documents/pending-review?limit=101')
        .set(empleadoVentas)
        .expect(400);
    });

    it('sin sesión → 401; un SUPERVISOR que no es responsable de nada → lista vacía, sin 403 (D9)', async () => {
      await seedOwned('2026-11-04');

      await http().get('/api/documents/pending-review').expect(401);
      await expect(pending(supervisorVentas)).resolves.toMatchObject({
        data: [],
        isReviewer: false,
      });
    });
  });

  // T12: "Marcar como revisado" (R6 a R10).
  describe('POST /api/documents/:id/review', () => {
    const empleadoOperaciones = authHeaders(FIXTURE_USERS.empleadoOperaciones);
    const markReviewed = (
      id: string,
      headers: Record<string, string>,
      body: Record<string, unknown> = { reviewDate: '2027-05-09' },
    ) => http().post(`/api/documents/${id}/review`).set(headers).send(body);
    const reviewDateOf = async (id: string) =>
      (await t.prisma.document.findUniqueOrThrow({ where: { id } })).reviewDate
        .toISOString()
        .slice(0, 10);

    it('E8: el responsable marca un vencido; cambia solo la fecha y la última revisión', async () => {
      const doc = await seedOwned('2026-11-04');
      await seedProcessedVersion(t.prisma, {
        documentId: doc.id,
        versionId: doc.versionId,
        areaIds: [AREA_IDS.ventas],
        chunks: 3,
      });
      const chunksBefore = await t.prisma.chunk.findMany({
        where: { documentId: doc.id },
        select: { id: true, isActive: true, areaIds: true },
        orderBy: { chunkIndex: 'asc' },
      });
      const enqueuedBefore = [...t.queue.enqueued];
      const put = jest.spyOn(t.storage, 'put');

      const response = await markReviewed(doc.id, empleadoVentas).expect(200);

      const body = response.body as DocumentBody & {
        currentVersion: { id: string };
      };
      expect(body.reviewDate).toBe('2027-05-09');
      expect(body.review).toEqual({
        status: 'UP_TO_DATE',
        lastReviewedAt: NOW.toISOString(),
        lastReviewedById: FIXTURE_USERS.empleadoVentas.id,
      });
      expect(body.currentVersion.id).toBe(doc.versionId);

      const versions = await t.prisma.documentVersion.findMany({
        where: { documentId: doc.id },
      });
      expect(versions).toHaveLength(1);
      expect(versions[0]).toMatchObject({
        id: doc.versionId,
        status: 'CURRENT',
      });
      await expect(
        t.prisma.chunk.findMany({
          where: { documentId: doc.id },
          select: { id: true, isActive: true, areaIds: true },
          orderBy: { chunkIndex: 'asc' },
        }),
      ).resolves.toEqual(chunksBefore);
      expect(t.queue.enqueued).toEqual(enqueuedBefore);
      expect(put).not.toHaveBeenCalled();
      put.mockRestore();

      // El detalle muestra la revisión: quién y cuándo (R11).
      expect((await detail(doc.id, empleadoVentas)).review).toEqual(
        body.review,
      );
    });

    it('una fecha dentro de los próximos 30 días se acepta y queda DUE_SOON (caso borde)', async () => {
      const doc = await seedOwned('2026-11-04');

      const response = await markReviewed(doc.id, empleadoVentas, {
        reviewDate: '2026-11-20',
      }).expect(200);

      expect((response.body as DocumentBody).review?.status).toBe('DUE_SOON');
    });

    it('E9: la fecha de hoy en Argentina → 400 y la fecha no cambia; mañana pasa', async () => {
      const doc = await seedOwned('2026-11-04');

      await markReviewed(doc.id, empleadoVentas, {
        reviewDate: '2026-11-09',
      }).expect(400);
      await markReviewed(doc.id, empleadoVentas, {}).expect(400);
      await markReviewed(doc.id, empleadoVentas, {
        reviewDate: '2026-13-01',
      }).expect(400);
      await http()
        .post('/api/documents/no-es-uuid/review')
        .set(empleadoVentas)
        .send({ reviewDate: '2027-05-09' })
        .expect(400);
      await expect(reviewDateOf(doc.id)).resolves.toBe('2026-11-04');

      await markReviewed(doc.id, empleadoVentas, {
        reviewDate: '2026-11-10',
      }).expect(200);
      await expect(reviewDateOf(doc.id)).resolves.toBe('2026-11-10');
    });

    it('E10: quien lo ve sin ser responsable → 403 y nada cambia; quien no lo ve → 404; sin sesión → 401', async () => {
      const doc = await seedDocument(t.prisma, {
        areaIds: [AREA_IDS.ventas],
        ownerId: FIXTURE_USERS.supervisorVentas.id,
        reviewDate: '2026-11-04',
      });

      await markReviewed(doc.id, empleadoVentas).expect(403);
      await markReviewed(doc.id, empleadoOperaciones).expect(404);
      await http()
        .post(`/api/documents/${doc.id}/review`)
        .send({ reviewDate: '2027-05-09' })
        .expect(401);

      const row = await t.prisma.document.findUniqueOrThrow({
        where: { id: doc.id },
      });
      expect(row.lastReviewedAt).toBeNull();
      await expect(reviewDateOf(doc.id)).resolves.toBe('2026-11-04');
    });

    it('E11: archivado → 409 ARCHIVED para el ADMIN; 404 para el responsable que no es ADMIN', async () => {
      const doc = await seedOwned('2026-11-04', { status: 'ARCHIVED' });

      const response = await markReviewed(doc.id, admin).expect(409);
      expect(response.body).toMatchObject({ reason: 'ARCHIVED' });
      await markReviewed(doc.id, empleadoVentas).expect(404);
    });

    it('un documento que no existe → 404', async () => {
      await markReviewed(randomUUID(), admin).expect(404);
    });

    it('responsable sin acceso → 404', async () => {
      const doc = await seedDocument(t.prisma, {
        areaIds: [AREA_IDS.operaciones],
        ownerId: FIXTURE_USERS.empleadoVentas.id,
        reviewDate: '2026-11-04',
      });

      await markReviewed(doc.id, empleadoVentas).expect(404);
    });

    it('E12: una versión nueva con fecha (endpoint real de la spec 003) cuenta como revisión del ADMIN', async () => {
      const doc = await seedOwned('2026-11-04');

      await http()
        .post(`/api/documents/${doc.id}/versions`)
        .set(admin)
        .field('reviewDate', '2027-11-09')
        .attach('file', uniquePdf(), {
          filename: 'manual-v2.pdf',
          contentType: 'application/pdf',
        })
        .expect(201);

      const review = (await detail(doc.id, admin)).review;
      expect(review?.status).toBe('UP_TO_DATE');
      expect(review?.lastReviewedById).toBe(FIXTURE_USERS.admin.id);
      expect(review?.lastReviewedAt).not.toBeNull();
    });

    it('R10: una versión nueva sin fecha no cambia la última revisión', async () => {
      const lastReview = {
        at: new Date('2026-05-04T14:12:09.000Z'),
        byId: FIXTURE_USERS.empleadoVentas.id,
      };
      const doc = await seedOwned('2026-11-04', { lastReview });

      await http()
        .post(`/api/documents/${doc.id}/versions`)
        .set(admin)
        .attach('file', uniquePdf(), {
          filename: 'manual-v2.pdf',
          contentType: 'application/pdf',
        })
        .expect(201);

      expect((await detail(doc.id, admin)).review).toEqual({
        status: 'OVERDUE',
        lastReviewedAt: lastReview.at.toISOString(),
        lastReviewedById: lastReview.byId,
      });
    });

    it('columnas: después de una revisión tienen valor juntas; un documento recién cargado por la API, las dos en null', async () => {
      const reviewed = await seedOwned('2026-11-04');
      await markReviewed(reviewed.id, empleadoVentas).expect(200);

      const uploaded = await http()
        .post('/api/documents')
        .set(admin)
        .field('title', 'Recién cargado')
        .field('areaIds', AREA_IDS.ventas)
        .field('ownerId', FIXTURE_USERS.empleadoVentas.id)
        .field('reviewDate', '2027-05-09')
        .attach('file', uniquePdf(), {
          filename: 'nuevo.pdf',
          contentType: 'application/pdf',
        })
        .expect(201);

      const rows = await t.prisma.document.findMany({
        where: {
          id: { in: [reviewed.id, (uploaded.body as DocumentBody).id] },
        },
        select: { id: true, lastReviewedAt: true, lastReviewedById: true },
      });
      const byId = new Map(rows.map((row) => [row.id, row]));
      expect(byId.get(reviewed.id)).toMatchObject({
        lastReviewedAt: NOW,
        lastReviewedById: FIXTURE_USERS.empleadoVentas.id,
      });
      expect(byId.get((uploaded.body as DocumentBody).id)).toMatchObject({
        lastReviewedAt: null,
        lastReviewedById: null,
      });
    });

    // T13 (R12): la auditoría con la fecha anterior y la nueva.
    describe('auditoría', () => {
      const reviewEntries = (record: jest.SpyInstance) =>
        record.mock.calls
          .map(([entry]) => entry as AuditEntry)
          .filter((entry) => entry.action === 'DOCUMENT_REVIEW');

      it('E8: queda DOCUMENT_REVIEW con quién, qué documento, cuándo, las dos fechas y el resultado', async () => {
        const doc = await seedOwned('2026-11-04');
        const record = jest.spyOn(t.audit, 'record');

        await markReviewed(doc.id, empleadoVentas).expect(200);

        expect(reviewEntries(record)).toEqual([
          {
            action: 'DOCUMENT_REVIEW',
            actorId: FIXTURE_USERS.empleadoVentas.id,
            documentId: doc.id,
            result: 'SUCCESS',
            previousReviewDate: '2026-11-04',
            newReviewDate: '2027-05-09',
            at: NOW,
          },
        ]);
        record.mockRestore();
      });

      it('dos revisiones a la vez: las dos 200, queda una de las fechas y la anterior de una es la nueva de la otra', async () => {
        const doc = await seedOwned('2026-11-04');
        const record = jest.spyOn(t.audit, 'record');

        const responses = await Promise.all([
          markReviewed(doc.id, empleadoVentas, { reviewDate: '2027-05-09' }),
          markReviewed(doc.id, admin, { reviewDate: '2027-06-01' }),
        ]);

        expect(responses.map((response) => response.status)).toEqual([
          200, 200,
        ]);
        const entries = reviewEntries(record);
        expect(entries).toHaveLength(2);
        expect(entries.every((entry) => entry.result === 'SUCCESS')).toBe(true);
        const [first, second] = entries;
        expect(first.previousReviewDate).toBe('2026-11-04');
        expect(second.previousReviewDate).toBe(first.newReviewDate);
        await expect(reviewDateOf(doc.id)).resolves.toBe(second.newReviewDate);
        record.mockRestore();
      });
    });
  });
});

// Un PDF distinto en cada llamada (otro checksum), para no chocar con el 409 de duplicados.
const uniquePdf = () =>
  Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.from(randomUUID())]);
