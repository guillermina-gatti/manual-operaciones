/* GET /api/documents, /:id y /:id/download de punta a punta (T20) */

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
  seedFixtureDirectory,
} from './helpers';

interface ListBody {
  data: { id: string; areaIds: string[]; status: string }[];
  total: number;
  page: number;
  limit: number;
}

describe('Consultas de documentos (integración)', () => {
  let t: DocumentsTestApp;
  // Tres documentos, del más viejo al más nuevo: Ventas, Operaciones y uno de Ventas archivado.
  let ventas: SeededDocument;
  let operaciones: SeededDocument;
  let archivadoVentas: SeededDocument;

  const admin = authHeaders(FIXTURE_USERS.admin);
  const empleadoVentas = authHeaders(FIXTURE_USERS.empleadoVentas);
  const http = () => request(t.app.getHttpServer());

  beforeAll(async () => {
    t = await createDocumentsTestApp();
    await seedFixtureDirectory(t.prisma);
  });

  afterAll(async () => {
    await t.app.close();
  });

  beforeEach(async () => {
    await cleanDocuments(t.prisma);
    t.storage.generatedLinks.length = 0;
    ventas = await seedDocument(t.prisma, {
      title: 'Caja',
      areaIds: [AREA_IDS.ventas],
      createdAt: new Date('2026-10-01T12:00:00Z'),
    });
    operaciones = await seedDocument(t.prisma, {
      title: 'Depósito',
      areaIds: [AREA_IDS.operaciones],
      createdAt: new Date('2026-10-02T12:00:00Z'),
    });
    archivadoVentas = await seedDocument(t.prisma, {
      title: 'Caja vieja',
      areaIds: [AREA_IDS.ventas],
      status: 'ARCHIVED',
      createdAt: new Date('2026-10-03T12:00:00Z'),
    });
  });

  describe('sin sesión', () => {
    it.each([
      ['listado', () => '/api/documents'],
      ['detalle', () => `/api/documents/${ventas.id}`],
      ['descarga', () => `/api/documents/${ventas.id}/download`],
    ])('%s responde 401', async (_name, path) => {
      await http().get(path()).expect(401);
    });
  });

  describe('GET /api/documents', () => {
    it('listado filtrado por área: el EMPLOYEE de Ventas solo recibe el de Ventas (R10)', async () => {
      const res = await http()
        .get('/api/documents')
        .set(empleadoVentas)
        .expect(200);

      const body = res.body as ListBody;
      expect(body.data.map((d) => d.id)).toEqual([ventas.id]);
      expect(body.total).toBe(1);
      expect(body).toMatchObject({ page: 1, limit: 20 });
    });

    it('un EMPLOYEE no ve un ARCHIVED de su propia área (D2)', async () => {
      const res = await http()
        .get('/api/documents')
        .set(empleadoVentas)
        .expect(200);

      expect((res.body as ListBody).data.map((d) => d.id)).not.toContain(
        archivadoVentas.id,
      );
    });

    // Spec 003 (R15, 18/11/2026): el archivado es el más nuevo, pero no entra en el listado del ADMIN.
    it('ordena del más nuevo al más viejo y, también para el ADMIN, solo los vigentes (R13, R15)', async () => {
      const res = await http().get('/api/documents').set(admin).expect(200);

      const body = res.body as ListBody;
      expect(body.data.map((d) => d.id)).toEqual([operaciones.id, ventas.id]);
      expect(body.data.every((d) => d.status === 'ACTIVE')).toBe(true);
      expect(body.total).toBe(2);
    });

    it('pagina con page=2&limit=1 (R13)', async () => {
      const res = await http()
        .get('/api/documents?page=2&limit=1')
        .set(admin)
        .expect(200);

      expect(res.body).toMatchObject({
        data: [{ id: ventas.id }],
        total: 2,
        page: 2,
        limit: 1,
      });
    });

    it('limit=101 responde 400 (D3)', async () => {
      await http().get('/api/documents?limit=101').set(admin).expect(400);
    });
  });

  // Spec 003 (R15, 18/11/2026): la lista de archivados, solo para el ADMIN.
  describe('GET /api/documents/archived', () => {
    it('el ADMIN recibe solo los archivados, el archivado más reciente primero', async () => {
      // Cargado antes que "Caja vieja", pero archivado después: va primero.
      const archivadoOperaciones = await seedDocument(t.prisma, {
        title: 'Depósito viejo',
        areaIds: [AREA_IDS.operaciones],
        status: 'ARCHIVED',
        createdAt: new Date('2026-09-01T12:00:00Z'),
        archivedAt: new Date('2026-11-10T12:00:00Z'),
      });
      await t.prisma.document.update({
        where: { id: archivadoVentas.id },
        data: { archivedAt: new Date('2026-11-01T12:00:00Z') },
      });

      const res = await http()
        .get('/api/documents/archived')
        .set(admin)
        .expect(200);

      const body = res.body as ListBody;
      expect(body.data.map((d) => d.id)).toEqual([
        archivadoOperaciones.id,
        archivadoVentas.id,
      ]);
      expect(body.data.every((d) => d.status === 'ARCHIVED')).toBe(true);
      expect(body).toMatchObject({ total: 2, page: 1, limit: 20 });
    });

    it('con limit=1 sirve de contador: total con todos los archivados', async () => {
      const res = await http()
        .get('/api/documents/archived?page=1&limit=1')
        .set(admin)
        .expect(200);

      expect(res.body).toMatchObject({
        data: [{ id: archivadoVentas.id }],
        total: 1,
        limit: 1,
      });
    });

    it.each([
      ['EMPLOYEE', FIXTURE_USERS.empleadoVentas],
      ['SUPERVISOR', FIXTURE_USERS.supervisorVentas],
    ])(
      'un %s recibe 403, aunque el archivado sea de su área',
      async (_role, user) => {
        await http()
          .get('/api/documents/archived')
          .set(authHeaders(user))
          .expect(403);
      },
    );

    it('sin sesión responde 401', async () => {
      await http().get('/api/documents/archived').expect(401);
    });

    it('limit=101 responde 400 (D3)', async () => {
      await http()
        .get('/api/documents/archived?limit=101')
        .set(admin)
        .expect(400);
    });
  });

  describe('GET /api/documents/:id', () => {
    it('devuelve el detalle de un documento visible', async () => {
      const res = await http()
        .get(`/api/documents/${ventas.id}`)
        .set(empleadoVentas)
        .expect(200);

      expect(res.body).toMatchObject({
        id: ventas.id,
        areaIds: [AREA_IDS.ventas],
        currentVersion: { id: ventas.versionId, processingStatus: 'PENDING' },
      });
      expect(res.body).not.toHaveProperty('currentVersion.storageKey');
      expect(res.body).not.toHaveProperty('currentVersion.checksum');
    });

    it('documento de otra área: 404 idéntico al de uno inexistente (R10, R11)', async () => {
      const ajeno = await http()
        .get(`/api/documents/${operaciones.id}`)
        .set(empleadoVentas)
        .expect(404);
      const inexistente = await http()
        .get(`/api/documents/${randomUUID()}`)
        .set(empleadoVentas)
        .expect(404);

      expect(ajeno.body).toEqual(inexistente.body);
    });

    it('un ARCHIVED de su área también es 404 para un EMPLOYEE (D2)', async () => {
      const archivado = await http()
        .get(`/api/documents/${archivadoVentas.id}`)
        .set(empleadoVentas)
        .expect(404);
      const inexistente = await http()
        .get(`/api/documents/${randomUUID()}`)
        .set(empleadoVentas)
        .expect(404);

      expect(archivado.body).toEqual(inexistente.body);
    });

    it('un id que no es UUID responde 400', async () => {
      await http().get('/api/documents/no-es-uuid').set(admin).expect(400);
    });
  });

  describe('GET /api/documents/:id/download', () => {
    it('descarga permitida con PENDING: url y expiresAt unos 300 s después (R12)', async () => {
      const before = Date.now();

      const res = await http()
        .get(`/api/documents/${ventas.id}/download`)
        .set(empleadoVentas)
        .expect(200);

      const body = res.body as { url: string; expiresAt: string };
      expect(body.url).toEqual(expect.any(String));
      const expiresInSeconds = (Date.parse(body.expiresAt) - before) / 1000;
      expect(expiresInSeconds).toBeGreaterThanOrEqual(295);
      expect(expiresInSeconds).toBeLessThanOrEqual(305);
      expect(t.storage.generatedLinks).toEqual([
        expect.objectContaining({
          key: ventas.storageKey,
          fileName: ventas.originalFileName,
        }),
      ]);
    });

    it('documento de otra área: 404 idéntico al de uno inexistente y sin enlace generado (R10, R11)', async () => {
      const ajeno = await http()
        .get(`/api/documents/${operaciones.id}/download`)
        .set(empleadoVentas)
        .expect(404);
      const inexistente = await http()
        .get(`/api/documents/${randomUUID()}/download`)
        .set(empleadoVentas)
        .expect(404);

      expect(ajeno.body).toEqual(inexistente.body);
      expect(t.storage.generatedLinks).toEqual([]);
    });

    it('un id que no es UUID responde 400 y no genera enlace', async () => {
      await http()
        .get('/api/documents/no-es-uuid/download')
        .set(admin)
        .expect(400);

      expect(t.storage.generatedLinks).toEqual([]);
    });
  });

  it('los tres endpoints aparecen en /api/docs', async () => {
    const res = await http().get('/api/docs-json').expect(200);

    const paths = (
      res.body as { paths: Record<string, Record<string, unknown>> }
    ).paths;
    expect(paths['/api/documents']?.get).toBeDefined();
    expect(paths['/api/documents/{id}']?.get).toBeDefined();
    expect(paths['/api/documents/{id}/download']?.get).toBeDefined();
  });
});
