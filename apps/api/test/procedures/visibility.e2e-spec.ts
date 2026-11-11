/* Who sees which procedures, end to end over HTTP against the test database
(spec 006, HU11, T17: E20 to E23, E26 and E27) */

import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AREA_IDS, FIXTURE_USERS } from '../../src/documents/adapters/fixtures';
import { ProceduresTestApp, authHeaders, createProceduresTestApp } from './app-helpers';
import { cleanProcedures, seedProcedure } from './helpers';

const NOT_FOUND = 'No se encontró el procedimiento';

describe('Procedures: visibility (integration)', () => {
  let t: ProceduresTestApp;
  const admin = authHeaders(FIXTURE_USERS.admin);
  const employeeVentas = authHeaders(FIXTURE_USERS.empleadoVentas);
  const employeeOperaciones = authHeaders(FIXTURE_USERS.empleadoOperaciones);
  const http = () => request(t.app.getHttpServer());

  const published = (areaId: string, title: string) =>
    seedProcedure(t.prisma, {
      areaIds: [areaId],
      versions: [{ versionNumber: 1, status: 'PUBLISHED', title, stepTitles: ['Contar'] }],
    });

  beforeAll(async () => {
    t = await createProceduresTestApp();
  });

  afterAll(async () => {
    await t.app.close();
  });

  beforeEach(async () => {
    await cleanProcedures(t.prisma);
  });

  it('E20: an EMPLOYEE of Ventas sees only the one of Ventas, as { data, total, page, limit }', async () => {
    const ventas = await published(AREA_IDS.ventas, 'Cierre de caja');
    await published(AREA_IDS.operaciones, 'Recepción de mercadería');

    const response = await http().get('/api/procedures').set(employeeVentas).expect(200);

    expect(response.body).toMatchObject({ total: 1, page: 1, limit: 20 });
    expect(response.body.data.map((item: { id: string }) => item.id)).toEqual([ventas.procedureId]);
    expect(response.body.data[0].areas).toEqual([
      { id: AREA_IDS.ventas, name: 'Ventas', isActive: true },
    ]);
    expect(response.body.data[0]).not.toHaveProperty('hasOpenDraft');
  });

  it('E21: the detail of another area is the same 404 as the one of an id that does not exist', async () => {
    const operaciones = await published(AREA_IDS.operaciones, 'Recepción de mercadería');

    const foreign = await http().get(`/api/procedures/${operaciones.procedureId}`).set(employeeVentas).expect(404);
    const missing = await http().get(`/api/procedures/${randomUUID()}`).set(employeeVentas).expect(404);

    expect(foreign.body).toEqual(missing.body);
    expect(foreign.body.message).toBe(NOT_FOUND);
    await http().get(`/api/procedures/${operaciones.procedureId}`).set(employeeOperaciones).expect(200);
  });

  it('E22: an EMPLOYEE sees the current version with its steps, never the draft or the old one', async () => {
    const { procedureId, versionIds } = await seedProcedure(t.prisma, {
      areaIds: [AREA_IDS.ventas],
      versions: [
        { versionNumber: 1, status: 'SUPERSEDED', title: 'Cierre v1', stepTitles: ['Viejo'] },
        { versionNumber: 2, status: 'PUBLISHED', title: 'Cierre v2', stepTitles: ['Contar', 'Firmar'] },
        { versionNumber: 3, status: 'DRAFT', title: 'Cierre v3', stepTitles: ['Borrador'] },
      ],
    });
    await seedProcedure(t.prisma, {
      areaIds: [AREA_IDS.ventas],
      versions: [{ versionNumber: 1, status: 'DRAFT', stepTitles: ['Solo borrador'] }],
    });
    await seedProcedure(t.prisma, {
      areaIds: [AREA_IDS.ventas],
      versions: [{ versionNumber: 1, status: 'PUBLISHED', stepTitles: [] }],
    });

    const detail = await http().get(`/api/procedures/${procedureId}`).set(employeeVentas).expect(200);
    const list = await http().get('/api/procedures').set(employeeVentas).expect(200);

    expect(detail.body.version).toMatchObject({ id: versionIds[1], versionNumber: 2, status: 'PUBLISHED' });
    expect(detail.body.version.steps.map((step: { title: string }) => step.title)).toEqual(['Contar', 'Firmar']);
    expect(list.body.total).toBe(1);
  });

  it('E23: an ADMIN sees all of them, newest first, with the open drafts flagged', async () => {
    const old = await published(AREA_IDS.ventas, 'Cierre de caja');
    const draft = await seedProcedure(t.prisma, {
      areaIds: [],
      versions: [{ versionNumber: 1, status: 'DRAFT', title: 'Nuevo', stepTitles: [] }],
    });

    const response = await http().get('/api/procedures').set(admin).expect(200);

    const items = response.body.data as { id: string; hasOpenDraft: boolean; version: { status: string } }[];
    expect(items.map((item) => item.id)).toEqual([draft.procedureId, old.procedureId]);
    expect(items.map((item) => item.hasOpenDraft)).toEqual([true, false]);
    expect(items[0].version.status).toBe('DRAFT');
  });

  it('E26: limit=101, page=0 and a value that is not a number are 400', async () => {
    for (const query of ['limit=101', 'page=0', 'limit=abc']) {
      await http().get(`/api/procedures?${query}`).set(employeeVentas).expect(400);
    }
  });

  it('E27: asking for one version by its id is a 403 for an EMPLOYEE', async () => {
    const { procedureId, versionIds } = await published(AREA_IDS.ventas, 'Cierre de caja').then(
      (seeded) => ({ procedureId: seeded.procedureId, versionIds: seeded.versionIds }),
    );

    await http().get(`/api/procedures/${procedureId}/versions/${versionIds[0]}`).set(employeeVentas).expect(403);
  });

  it('401: without a session', async () => {
    await http().get('/api/procedures').expect(401);
  });
});
