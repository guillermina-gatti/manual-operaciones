/* Area assignment end to end over HTTP against the test database (spec 006, E17–E19, R11) */

import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AREA_IDS, FIXTURE_USERS } from '../../src/documents/adapters/fixtures';
import {
  ProceduresTestApp,
  authHeaders,
  createProceduresTestApp,
} from './app-helpers';
import { createArea, deleteAreas } from './area-helpers';
import { cleanProcedures, seedProcedure } from './helpers';

const { ventas: VENTAS, operaciones: OPERACIONES } = AREA_IDS;
const NOT_FOUND_PROCEDURE = 'No se encontró el procedimiento';

describe('Procedures: areas (integration)', () => {
  let t: ProceduresTestApp;
  const admin = authHeaders(FIXTURE_USERS.admin);
  const supervisor = authHeaders(FIXTURE_USERS.supervisorVentas);
  const employee = authHeaders(FIXTURE_USERS.empleadoVentas);
  const http = () => request(t.app.getHttpServer());

  const put = (procedureId: string, areaIds: unknown) =>
    http().put(`/api/procedures/${procedureId}/areas`).send({ areaIds });

  const storedAreas = async (procedureId: string) =>
    (
      await t.prisma.procedureArea.findMany({
        where: { procedureId },
        orderBy: { areaId: 'asc' },
      })
    ).map((row) => row.areaId);

  // The inactive areas of these tests: created here and removed after each test, so the seed and
  // the fixtures of the other teams are never touched.
  const createdAreas: string[] = [];
  const newArea = async (isActive: boolean) => {
    const id = await createArea(t.prisma, isActive);
    createdAreas.push(id);
    return id;
  };

  beforeAll(async () => {
    t = await createProceduresTestApp();
  });

  afterEach(async () => {
    await deleteAreas(t.prisma, createdAreas.splice(0));
  });

  afterAll(async () => {
    await t.app.close();
  });

  beforeEach(async () => {
    await cleanProcedures(t.prisma);
  });

  it('E17: an ADMIN assigns two areas (200) and then reassigns only one, replacing the set', async () => {
    const { procedureId } = await seedProcedure(t.prisma, {
      versions: [{ versionNumber: 1, status: 'DRAFT' }],
    });

    const first = await put(procedureId, [VENTAS, OPERACIONES])
      .set(admin)
      .expect(200);
    expect(first.body).toEqual({ areaIds: [VENTAS, OPERACIONES] });
    expect(await storedAreas(procedureId)).toEqual([VENTAS, OPERACIONES]);

    const second = await put(procedureId, [VENTAS]).set(admin).expect(200);
    expect(second.body).toEqual({ areaIds: [VENTAS] });
    expect(await storedAreas(procedureId)).toEqual([VENTAS]);
  });

  it('R11: an empty set is 200 and leaves the procedure without areas', async () => {
    const { procedureId } = await seedProcedure(t.prisma, {
      areaIds: [VENTAS],
      versions: [{ versionNumber: 1, status: 'DRAFT' }],
    });

    const response = await put(procedureId, []).set(admin).expect(200);

    expect(response.body).toEqual({ areaIds: [] });
    expect(await storedAreas(procedureId)).toEqual([]);
  });

  it('P19: ids in upper case are accepted and stored in lower case', async () => {
    const { procedureId } = await seedProcedure(t.prisma, {
      versions: [{ versionNumber: 1, status: 'DRAFT' }],
    });

    const response = await put(procedureId, [VENTAS.toUpperCase()])
      .set(admin)
      .expect(200);

    expect(response.body).toEqual({ areaIds: [VENTAS] });
    expect(await storedAreas(procedureId)).toEqual([VENTAS]);
  });

  it('E18: an area that does not exist is 400 and the procedure stays in Ventas', async () => {
    const { procedureId } = await seedProcedure(t.prisma, {
      areaIds: [VENTAS],
      versions: [{ versionNumber: 1, status: 'DRAFT' }],
    });

    const response = await put(procedureId, [OPERACIONES, randomUUID()])
      .set(admin)
      .expect(400);

    expect(response.body.message).toBe('Alguna de las áreas no existe');
    expect(await storedAreas(procedureId)).toEqual([VENTAS]);
  });

  it.each([
    ['a repeated area', [VENTAS, VENTAS]],
    ['an id that is not a UUID', ['ventas']],
    ['a single id instead of a list', VENTAS],
  ])(
    'E18: %s is 400 and the procedure stays in Ventas',
    async (_case, areaIds) => {
      const { procedureId } = await seedProcedure(t.prisma, {
        areaIds: [VENTAS],
        versions: [{ versionNumber: 1, status: 'DRAFT' }],
      });

      await put(procedureId, areaIds).set(admin).expect(400);

      expect(await storedAreas(procedureId)).toEqual([VENTAS]);
    },
  );

  it('R1: without a session 401, and a SUPERVISOR or an EMPLOYEE get 403 with nothing written', async () => {
    const { procedureId } = await seedProcedure(t.prisma, {
      areaIds: [VENTAS],
      versions: [{ versionNumber: 1, status: 'DRAFT' }],
    });

    await put(procedureId, [OPERACIONES]).expect(401);
    await put(procedureId, [OPERACIONES]).set(supervisor).expect(403);
    await put(procedureId, [OPERACIONES]).set(employee).expect(403);

    expect(await storedAreas(procedureId)).toEqual([VENTAS]);
  });

  it('a procedure that does not exist is 404, and a bad id in the path is 400', async () => {
    const response = await put(randomUUID(), [VENTAS]).set(admin).expect(404);
    expect(response.body.message).toBe(NOT_FOUND_PROCEDURE);

    await put('uno', [VENTAS]).set(admin).expect(400);
    expect(await t.prisma.procedureArea.count()).toBe(0);
  });

  it('E19 (areas half): moving a published procedure from Ventas to Operaciones works with an open draft and leaves the versions as they were', async () => {
    const seeded = await seedProcedure(t.prisma, {
      areaIds: [VENTAS],
      versions: [
        { versionNumber: 1, status: 'PUBLISHED', stepTitles: ['A', 'B'] },
        { versionNumber: 2, status: 'DRAFT', stepTitles: ['A', 'B', 'C'] },
      ],
    });
    const versions = () =>
      t.prisma.procedureVersion.findMany({
        where: { procedureId: seeded.procedureId },
        orderBy: { versionNumber: 'asc' },
        include: { steps: { orderBy: { stepOrder: 'asc' } } },
      });
    const before = await versions();

    await put(seeded.procedureId, [OPERACIONES]).set(admin).expect(200);

    expect(await storedAreas(seeded.procedureId)).toEqual([OPERACIONES]);
    expect(await versions()).toEqual(before);
  });

  it('E35: a new inactive area is 400 and the procedure stays in Ventas', async () => {
    const inactive = await newArea(false);
    const { procedureId } = await seedProcedure(t.prisma, {
      areaIds: [VENTAS],
      versions: [{ versionNumber: 1, status: 'DRAFT' }],
    });

    const response = await put(procedureId, [VENTAS, inactive])
      .set(admin)
      .expect(400);

    expect(response.body.message).toBe('Alguna de las áreas está inactiva');
    expect(await storedAreas(procedureId)).toEqual([VENTAS]);
  });

  it('E36: an inactive area the procedure already had is kept, and the versions do not change', async () => {
    const inactive = await newArea(false);
    const seeded = await seedProcedure(t.prisma, {
      areaIds: [VENTAS, inactive],
      versions: [
        { versionNumber: 1, status: 'PUBLISHED', stepTitles: ['A', 'B'] },
        { versionNumber: 2, status: 'DRAFT', stepTitles: ['A', 'B', 'C'] },
      ],
    });
    const versions = () =>
      t.prisma.procedureVersion.findMany({
        where: { procedureId: seeded.procedureId },
        orderBy: { versionNumber: 'asc' },
        include: { steps: { orderBy: { stepOrder: 'asc' } } },
      });
    const before = await versions();

    const response = await put(seeded.procedureId, [
      VENTAS,
      inactive,
      OPERACIONES,
    ])
      .set(admin)
      .expect(200);

    // Same order as the database: by id, as text.
    const byId = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
    const expected = [VENTAS, inactive, OPERACIONES].sort(byId);
    expect([...response.body.areaIds].sort(byId)).toEqual(expected);
    expect(await storedAreas(seeded.procedureId)).toEqual(expected);
    expect(await versions()).toEqual(before);
  });

  it('E37: the inactive area can be removed, and then it cannot be added back', async () => {
    const inactive = await newArea(false);
    const { procedureId } = await seedProcedure(t.prisma, {
      areaIds: [VENTAS, inactive],
      versions: [{ versionNumber: 1, status: 'DRAFT' }],
    });

    await put(procedureId, [VENTAS]).set(admin).expect(200);
    expect(await storedAreas(procedureId)).toEqual([VENTAS]);

    await put(procedureId, [VENTAS, inactive]).set(admin).expect(400);
    expect(await storedAreas(procedureId)).toEqual([VENTAS]);
  });

  it('E38: an inactive area for a procedure that does not exist is 400 and not 404', async () => {
    const inactive = await newArea(false);

    await put(randomUUID(), [inactive]).set(admin).expect(400);

    const response = await put(randomUUID(), [inactive, randomUUID()])
      .set(admin)
      .expect(400);
    expect(response.body.message).toBe('Alguna de las áreas no existe');
  });
});
