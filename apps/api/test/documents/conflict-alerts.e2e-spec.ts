/* Spec 011 (T09): GET /api/conflict-alerts y POST /api/conflict-alerts/:id/resolve de punta a punta,
con la base de tests. Las alertas se siembran con SQL (conflict-helpers.ts). */

import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AREA_IDS, FIXTURE_USERS } from '../../src/documents/adapters/fixtures';
import {
  type ChunkedDocument,
  insertAlert,
  readAlerts,
  seedChunkedDocument,
  seedNewVersion,
} from './conflict-helpers';
import {
  DocumentsTestApp,
  authHeaders,
  cleanDocuments,
  createDocumentsTestApp,
} from './helpers';

interface AlertBody {
  id: string;
  status: string;
  documents: {
    id: string;
    title: string;
    status: string;
    versionNumber: number;
    section: string;
    isCurrentVersion: boolean;
  }[];
  question: string;
  occurrences: number;
  resolvedAt: string | null;
  resolvedBy: { id: string; name: string | null; isActive: boolean } | null;
  resolutionNote: string | null;
}

interface ListBody {
  data: AlertBody[];
  total: number;
  openTotal: number;
  page: number;
  limit: number;
}

describe('Alertas de contradicción (integración, spec 011)', () => {
  let t: DocumentsTestApp;
  const admin = authHeaders(FIXTURE_USERS.admin);
  const supervisor = authHeaders(FIXTURE_USERS.supervisorVentas);
  const empleado = authHeaders(FIXTURE_USERS.empleadoVentas);
  const http = () => request(t.app.getHttpServer());
  const list = async (query = '') =>
    (await http().get(`/api/conflict-alerts${query}`).set(admin).expect(200))
      .body as ListBody;
  const resolve = (id: string, body: object = {}, headers = admin) =>
    http().post(`/api/conflict-alerts/${id}/resolve`).set(headers).send(body);

  let manual: ChunkedDocument;
  let politica: ChunkedDocument;
  let instructivo: ChunkedDocument;

  beforeAll(async () => {
    t = await createDocumentsTestApp();
  });

  afterAll(async () => {
    await cleanDocuments(t.prisma);
    await t.app.close();
  });

  beforeEach(async () => {
    await cleanDocuments(t.prisma);
    const seed = (title: string) =>
      seedChunkedDocument(t.prisma, {
        areaIds: [AREA_IDS.ventas],
        title,
        content: `${title}: las compras grandes las aprueba alguien.`,
      });
    manual = await seed('Manual de compras');
    politica = await seed('Política de gastos');
    instructivo = await seed('Instructivo de pagos');
  });

  it('E11: las abiertas, de la última detección a la más vieja, con openTotal', async () => {
    const older = await insertAlert(t.prisma, manual, politica, {
      lastDetectedAt: new Date('2026-11-05T13:00:00.000Z'),
    });
    const newer = await insertAlert(t.prisma, politica, instructivo, {
      lastDetectedAt: new Date('2026-11-07T13:00:00.000Z'),
      question: '¿Quién paga?',
    });
    await insertAlert(t.prisma, manual, instructivo, { status: 'RESOLVED' });

    const body = await list();

    expect(body).toMatchObject({ total: 2, openTotal: 2, page: 1, limit: 20 });
    expect(body.data.map((a) => a.id)).toEqual([newer, older]);
    const [first] = body.data;
    expect(first).toMatchObject({
      status: 'OPEN',
      question: '¿Quién paga?',
      occurrences: 1,
      resolvedAt: null,
      resolvedBy: null,
      resolutionNote: null,
    });
    expect(first.documents.map((d) => d.id)).toEqual(
      [politica.id, instructivo.id].sort(),
    );
    expect(first.documents[0]).toMatchObject({
      status: 'ACTIVE',
      versionNumber: 1,
      section: 'Sin sección',
      isCurrentVersion: true,
    });
    expect(Object.keys(first)).not.toContain('messageId');
  });

  it('las resueltas, con quién las resolvió', async () => {
    await insertAlert(t.prisma, manual, politica, { status: 'RESOLVED' });

    const body = await list('?status=RESOLVED');

    expect(body).toMatchObject({ total: 1, openTotal: 0 });
    expect(body.data[0].resolvedBy).toEqual({
      id: FIXTURE_USERS.admin.id,
      name: expect.any(String),
      isActive: true,
    });
  });

  it('la sección del fragmento, y "Sin sección" si ya no existe', async () => {
    await t.prisma.chunk.update({
      where: { id: manual.chunkId },
      data: { section: 'Aprobaciones' },
    });
    await insertAlert(t.prisma, manual, politica);
    await t.prisma.chunk.delete({ where: { id: politica.chunkId } });

    const [alert] = (await list()).data;

    const byId = new Map(alert.documents.map((d) => [d.id, d.section]));
    expect(byId.get(manual.id)).toBe('Aprobaciones');
    expect(byId.get(politica.id)).toBe('Sin sección');
  });

  it('E12: sin sesión 401; SUPERVISOR y EMPLOYEE 403', async () => {
    const id = await insertAlert(t.prisma, manual, politica);

    await http().get('/api/conflict-alerts').expect(401);
    for (const headers of [supervisor, empleado]) {
      await http().get('/api/conflict-alerts').set(headers).expect(403);
      await resolve(id, {}, headers).expect(403);
    }
    expect((await readAlerts(t.prisma))[0].status).toBe('OPEN');
  });

  it('E13: el ADMIN la marca como resuelta con una nota', async () => {
    const id = await insertAlert(t.prisma, manual, politica);

    const res = await resolve(id, {
      note: 'Corregida la política en la v2',
    }).expect(200);

    expect(res.body).toMatchObject({
      id,
      status: 'RESOLVED',
      resolvedBy: { id: FIXTURE_USERS.admin.id },
      resolutionNote: 'Corregida la política en la v2',
    });
    expect(await readAlerts(t.prisma)).toEqual([
      expect.objectContaining({
        status: 'RESOLVED',
        resolved_by_id: FIXTURE_USERS.admin.id,
        resolution_note: 'Corregida la política en la v2',
      }),
    ]);
    expect((await list()).openTotal).toBe(0);
  });

  it('E14: una ya resuelta es 409', async () => {
    const id = await insertAlert(t.prisma, manual, politica);
    await resolve(id).expect(200);

    const res = await resolve(id).expect(409);

    expect(res.body.message).toBe('La alerta ya está resuelta');
  });

  it('una que no existe es 404; un id que no es UUID, o una nota larga, 400', async () => {
    const id = await insertAlert(t.prisma, manual, politica);

    const missing = await resolve(randomUUID()).expect(404);
    expect(missing.body.message).toBe('No se encontró la alerta');
    await resolve('no-es-uuid').expect(400);
    await resolve(id, { note: 'a'.repeat(501) }).expect(400);
    await http()
      .get('/api/conflict-alerts?status=CLOSED')
      .set(admin)
      .expect(400);
    await http().get('/api/conflict-alerts?userId=x').set(admin).expect(400);
  });

  it('E15: si se archiva uno y el otro tiene una versión nueva, sigue abierta', async () => {
    await insertAlert(t.prisma, manual, politica);
    await t.prisma.document.update({
      where: { id: manual.id },
      data: { status: 'ARCHIVED', archivedAt: new Date() },
    });
    await seedNewVersion(t.prisma, politica, {
      areaIds: [AREA_IDS.ventas],
      content: 'La v2 de la política.',
    });

    const [alert] = (await list()).data;

    expect(alert.status).toBe('OPEN');
    const byId = new Map(alert.documents.map((d) => [d.id, d]));
    expect(byId.get(manual.id)).toMatchObject({
      status: 'ARCHIVED',
      isCurrentVersion: true,
    });
    expect(byId.get(politica.id)).toMatchObject({
      status: 'ACTIVE',
      versionNumber: 1,
      isCurrentVersion: false,
    });
  });

  // T15: las dos rutas y sus respuestas en Swagger, y lo que trae conflict en la ruta de streaming.
  it('Swagger documenta las rutas de las alertas y el estado conflict', async () => {
    const res = await http().get('/api/docs-json').expect(200);
    const paths = (
      res.body as {
        paths: Record<
          string,
          Record<string, { responses: Record<string, unknown> }>
        >;
      }
    ).paths;

    expect(
      Object.keys(paths['/api/conflict-alerts']?.get?.responses ?? {}).sort(),
    ).toEqual(['200', '400', '401', '403', '503']);
    expect(
      Object.keys(
        paths['/api/conflict-alerts/{id}/resolve']?.post?.responses ?? {},
      ).sort(),
    ).toEqual(['200', '400', '401', '403', '404', '409', '503']);
    expect(JSON.stringify(paths['/api/chat/stream']?.post)).toContain(
      'Con status conflict (spec 011) no hay',
    );
  });
});
