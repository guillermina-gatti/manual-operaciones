/* The areas decide who sees a procedure, end to end against the test database
(spec 006, HU11, T17: E19, E24, E39 and E40) */

import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AREA_IDS, FIXTURE_USERS } from '../../src/documents/adapters/fixtures';
import { ProceduresTestApp, authHeaders, createProceduresTestApp } from './app-helpers';
import { cleanProcedures, seedProcedure } from './helpers';

describe('Procedures: visibility by area (integration)', () => {
  let t: ProceduresTestApp;
  const admin = authHeaders(FIXTURE_USERS.admin);
  const employeeVentas = authHeaders(FIXTURE_USERS.empleadoVentas);
  const employeeOperaciones = authHeaders(FIXTURE_USERS.empleadoOperaciones);
  const http = () => request(t.app.getHttpServer());

  const inVentas = () =>
    seedProcedure(t.prisma, {
      areaIds: [AREA_IDS.ventas],
      versions: [{ versionNumber: 1, status: 'PUBLISHED', stepTitles: ['Contar'] }],
    });
  const setActive = (areaId: string, isActive: boolean) =>
    t.prisma.area.update({ where: { id: areaId }, data: { isActive } });

  beforeAll(async () => {
    t = await createProceduresTestApp();
  });

  afterAll(async () => {
    await t.app.close();
  });

  beforeEach(async () => {
    await cleanProcedures(t.prisma);
  });

  afterEach(async () => {
    await setActive(AREA_IDS.ventas, true);
    await t.prisma.user.deleteMany({ where: { email: 'sinareas@visibility.test' } });
  });

  it('E19: moving the procedure from Ventas to Operaciones changes who sees it', async () => {
    const { procedureId } = await inVentas();
    await http().get(`/api/procedures/${procedureId}`).set(employeeVentas).expect(200);

    await http()
      .put(`/api/procedures/${procedureId}/areas`)
      .set(admin)
      .send({ areaIds: [AREA_IDS.operaciones] })
      .expect(200);

    await http().get(`/api/procedures/${procedureId}`).set(employeeVentas).expect(404);
    await http().get(`/api/procedures/${procedureId}`).set(employeeOperaciones).expect(200);
  });

  it('E39: when the only area is deactivated the EMPLOYEE stops seeing it, and the ADMIN sees it marked', async () => {
    const { procedureId } = await inVentas();
    await setActive(AREA_IDS.ventas, false);

    const list = await http().get('/api/procedures').set(employeeVentas).expect(200);
    await http().get(`/api/procedures/${procedureId}`).set(employeeVentas).expect(404);
    const forAdmin = await http().get(`/api/procedures/${procedureId}`).set(admin).expect(200);

    expect(list.body).toMatchObject({ data: [], total: 0 });
    expect(forAdmin.body.areas).toEqual([{ id: AREA_IDS.ventas, name: 'Ventas', isActive: false }]);
  });

  it('E24: a user without areas gets an empty list and a 404', async () => {
    const { procedureId } = await inVentas();
    const id = randomUUID();
    await t.prisma.user.create({
      data: { id, name: 'Sin Áreas', email: 'sinareas@visibility.test', passwordHash: 'x', role: 'EMPLOYEE' },
    });
    const noAreas = authHeaders({ id, role: 'EMPLOYEE' });

    const list = await http().get('/api/procedures').set(noAreas).expect(200);
    await http().get(`/api/procedures/${procedureId}`).set(noAreas).expect(404);

    expect(list.body).toMatchObject({ data: [], total: 0 });
  });

  it('E40: an inactive user is not let in', async () => {
    await inVentas();
    await t.prisma.user.update({ where: { id: FIXTURE_USERS.empleadoVentas.id }, data: { isActive: false } });

    try {
      await http().get('/api/procedures').set(employeeVentas).expect(401);
    } finally {
      await t.prisma.user.update({ where: { id: FIXTURE_USERS.empleadoVentas.id }, data: { isActive: true } });
    }
  });
});
