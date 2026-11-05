/* Búsqueda de punta a punta (spec 004, T08): GET /api/documents/search con la app y la base de tests */

import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AREA_IDS, FIXTURE_USERS } from '../../src/documents/adapters/fixtures';
import {
  DocumentsTestApp,
  authHeaders,
  cleanDocuments,
  createDocumentsTestApp,
  seedDocument,
  seedProcessedVersion,
} from './helpers';

interface SearchBody {
  data: {
    id: string;
    title: string;
    fragment: {
      parts: { text: string; match: boolean }[];
      pageNumber: number | null;
    } | null;
  }[];
  total: number;
  page: number;
  limit: number;
}

const uniquePdf = () =>
  Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.from(randomUUID())]);

describe('GET /api/documents/search (integración)', () => {
  let t: DocumentsTestApp;

  const admin = authHeaders(FIXTURE_USERS.admin);
  const empleadoVentas = authHeaders(FIXTURE_USERS.empleadoVentas);
  const empleadoOperaciones = authHeaders(FIXTURE_USERS.empleadoOperaciones);
  const http = () => request(t.app.getHttpServer());

  const search = (headers: Record<string, string>, query: Record<string, string>) =>
    http().get('/api/documents/search').query(query).set(headers);
  const found = async (headers: Record<string, string>, q: string) => {
    const res = await search(headers, { q });
    expect(res.status).toBe(200);
    return res.body as SearchBody;
  };
  const ids = (body: SearchBody) => body.data.map((item) => item.id);
  const fullText = (body: SearchBody) =>
    body.data[0].fragment?.parts.map((part) => part.text).join('');

  // Un documento con su versión vigente procesada y estos fragmentos.
  async function documentWith(
    contents: string[],
    opts: {
      areaIds?: string[];
      title?: string;
      description?: string;
      pageNumbers?: (number | null)[];
    } = {},
  ) {
    const areaIds = opts.areaIds ?? [AREA_IDS.ventas];
    const document = await seedDocument(t.prisma, {
      areaIds,
      title: opts.title ?? 'Manual',
      description: opts.description,
    });
    if (contents.length > 0) {
      await seedProcessedVersion(t.prisma, {
        documentId: document.id,
        versionId: document.versionId,
        areaIds,
        contents,
        pageNumbers: opts.pageNumbers,
      });
    }
    return document;
  }

  beforeAll(async () => {
    t = await createDocumentsTestApp();
  });

  afterAll(async () => {
    await t.app.close();
  });

  beforeEach(async () => {
    await cleanDocuments(t.prisma);
  });

  it('la ruta va antes de :id: "search" no llega al ParseUUIDPipe', async () => {
    const res = await search(admin, { q: 'caja' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: [], total: 0, page: 1, limit: 20 });
  });

  it('E1: encuentra por contenido, con las palabras marcadas y la página', async () => {
    const document = await documentWith(
      ['Al terminar el turno se hace el cierre de caja diario.'],
      { pageNumbers: [4] },
    );

    const res = await search(empleadoVentas, { q: 'cierre de caja' });
    const body = res.body as SearchBody;

    expect(res.status).toBe(200);
    expect(ids(body)).toEqual([document.id]);
    expect(body.data[0].fragment?.pageNumber).toBe(4);
    expect(
      body.data[0].fragment?.parts.filter((part) => part.match).map((part) => part.text),
    ).toEqual(['cierre', 'caja']);
    expect(res.text).not.toMatch(/[]/);
    expect(res.text).not.toMatch(/storageKey|checksum/);
  });

  it('E2: encuentra por título un documento sin procesar, sin fragmento', async () => {
    const document = await documentWith([], { title: 'Manual de facturación' });

    const body = await found(empleadoVentas, 'facturación');

    expect(ids(body)).toEqual([document.id]);
    expect(body.data[0].fragment).toBeNull();
  });

  it('E2: una coincidencia solo en la descripción, sin fragmento', async () => {
    const document = await documentWith(['Otro tema'], {
      description: 'Cómo se emiten las facturas',
    });

    const body = await found(admin, 'facturas');

    expect(ids(body)).toEqual([document.id]);
    expect(body.data[0].fragment).toBeNull();
  });

  it('E3: "instruccion tecnica" encuentra "Instrucción técnica" y muestra la tilde', async () => {
    const document = await documentWith(['Instrucción técnica para el depósito']);

    const body = await found(empleadoVentas, 'instruccion tecnica');

    expect(ids(body)).toEqual([document.id]);
    expect(body.data[0].fragment?.parts).toContainEqual({
      text: 'Instrucción',
      match: true,
    });
  });

  it('E4: "procedimientos" encuentra "procedimiento de devolución"', async () => {
    const document = await documentWith(['El procedimiento de devolución']);

    expect(ids(await found(empleadoVentas, 'procedimientos'))).toEqual([document.id]);
  });

  it('E5: un EMPLOYEE de Ventas no recibe el documento de Operaciones ni su texto', async () => {
    const operaciones = await documentWith(['Control de inventario mensual'], {
      areaIds: [AREA_IDS.operaciones],
      title: 'Inventario',
    });

    const res = await search(empleadoVentas, { q: 'inventario' });

    expect(res.status).toBe(200);
    expect((res.body as SearchBody).total).toBe(0);
    expect(res.text).not.toContain(operaciones.id);
    expect(res.text.toLowerCase()).not.toContain('inventario');
    expect(ids(await found(empleadoOperaciones, 'inventario'))).toEqual([operaciones.id]);
    expect(ids(await found(admin, 'inventario'))).toEqual([operaciones.id]);
  });

  it('E6: después de subir una versión nueva, la frase de la reemplazada no se encuentra', async () => {
    const document = await documentWith(['La tarifa vieja del servicio']);
    expect(ids(await found(admin, 'tarifa vieja'))).toEqual([document.id]);

    const upload = await http()
      .post(`/api/documents/${document.id}/versions`)
      .set(admin)
      .attach('file', uniquePdf(), 'v2.pdf');
    expect(upload.status).toBe(201);
    await seedProcessedVersion(t.prisma, {
      documentId: document.id,
      versionId: (upload.body as { currentVersion: { id: string } }).currentVersion.id,
      areaIds: [AREA_IDS.ventas],
      contents: ['La tarifa nueva del servicio'],
    });

    expect((await found(admin, 'tarifa vieja')).total).toBe(0);
    expect(ids(await found(admin, 'tarifa nueva'))).toEqual([document.id]);
  });

  it('E7: un documento archivado no se encuentra, ni por contenido ni por título', async () => {
    const document = await documentWith(['El procedimiento antiguo'], {
      title: 'Procedimiento antiguo',
    });

    const archive = await http().post(`/api/documents/${document.id}/archive`).set(admin);
    expect(archive.status).toBe(200);

    expect((await found(admin, 'procedimiento antiguo')).total).toBe(0);
  });

  it('E8: cinco fragmentos con "stock" dan un solo resultado', async () => {
    await documentWith(['stock uno', 'stock dos', 'stock tres', 'stock cuatro', 'stock cinco']);

    const body = await found(empleadoVentas, 'stock');

    expect(body.data).toHaveLength(1);
    expect(body.total).toBe(1);
  });

  it.each([
    [{ q: 'ca' }],
    [{ q: '  ca  ' }],
    [{ q: 'a'.repeat(101) }],
    [{}],
    [{ q: 'caja', limit: '101' }],
  ])('E9 y R10: %j → 400', async (query) => {
    const res = await search(empleadoVentas, query as Record<string, string>);

    expect(res.status).toBe(400);
  });

  it('R1: sin sesión → 401', async () => {
    const res = await http().get('/api/documents/search').query({ q: 'caja' });

    expect(res.status).toBe(401);
  });

  it('E10: "caja & | ! :" → 200 y encuentra "caja"', async () => {
    const document = await documentWith(['La caja chica']);

    expect(ids(await found(empleadoVentas, 'caja & | ! :'))).toEqual([document.id]);
  });

  it.each([
    ['"caja"'],
    ['caja:*'],
    ['!!caja'],
    ['(caja'],
    ['caja <-> cierre'],
    ['\\\\\\'],
    ["'; DROP TABLE documents; --"],
  ])('E10: "%s" nunca da 500', async (q) => {
    await documentWith(['La caja chica']);

    const res = await search(admin, { q });

    expect(res.status).toBe(200);
    expect(await t.prisma.document.count()).toBe(1);
  });

  it('E11: sin resultados → 200 con data vacía', async () => {
    await documentWith(['La caja chica']);

    const res = await search(empleadoVentas, { q: 'xyzxyz' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: [], total: 0, page: 1, limit: 20 });
  });

  it('E12: el HTML del fragmento llega como texto, sin etiquetas agregadas', async () => {
    await documentWith(['<script>alert(1)</script> caja']);

    const body = await found(empleadoVentas, 'caja');

    expect(fullText(body)).toBe('<script>alert(1)</script> caja');
    expect(JSON.stringify(body)).not.toMatch(/<b>|<mark>/);
  });

  it('R10: page y limit llegan a la respuesta', async () => {
    for (let i = 0; i < 3; i++) await documentWith([], { title: `Stock ${i}` });

    const res = await search(admin, { q: 'stock', page: '2', limit: '2' });
    const body = res.body as SearchBody;

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ total: 3, page: 2, limit: 2 });
    expect(body.data).toHaveLength(1);
  });
});
