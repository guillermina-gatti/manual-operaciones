/* Métricas de documentos de punta a punta (spec 007; plan 5.2; T06). El reloj de documentos está fijo
en el 9/11/2026 a las 23:30 de Buenos Aires, que en UTC ya es el 10/11 (D5 del plan 005): un cálculo
de "hoy" en UTC cambiaría de grupo los bordes de la revisión. */

import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AREA_IDS, FIXTURE_USERS } from '../../src/documents/adapters/fixtures';
import {
  DocumentsTestApp,
  FixedClock,
  authHeaders,
  cleanDocuments,
  createDocumentsTestApp,
  getTestFixturePasswordHash,
  seedDocument,
  setProcessingStatus,
} from './helpers';

const NOW = new Date('2026-11-10T02:30:00.000Z');
const { ventas: VENTAS, operaciones: OPERACIONES } = AREA_IDS;
const UNKNOWN_AREA = '0a000000-0000-4000-8000-000000000099';
const ZERO = {
  active: 0,
  upToDate: 0,
  dueSoon: 0,
  overdue: 0,
  processingFailed: 0,
  uploaded: 0,
};

interface MetricsBody {
  filters: { areaId: string | null; from: string | null; to: string | null };
  totals: typeof ZERO;
}

describe('Métricas de documentos (integración)', () => {
  let t: DocumentsTestApp;

  const admin = authHeaders(FIXTURE_USERS.admin);
  const supervisorVentas = authHeaders(FIXTURE_USERS.supervisorVentas);
  const supervisorOperaciones = authHeaders(
    FIXTURE_USERS.supervisorOperaciones,
  );
  const empleadoVentas = authHeaders(FIXTURE_USERS.empleadoVentas);

  const get = (query = '') =>
    request(t.app.getHttpServer()).get(`/api/metrics/documents${query}`);
  const metrics = async (headers: Record<string, string>, query = '') =>
    (await get(query).set(headers).expect(200)).body as MetricsBody;

  // Un SUPERVISOR de prueba con las áreas pedidas (los fixtures tienen una sola área por usuario),
  // creado en la base de tests y borrado al terminar, como en la spec 005 (T11).
  const withSupervisor = async (
    areaIds: string[],
    run: (id: string, headers: Record<string, string>) => Promise<void>,
  ) => {
    const id = randomUUID();
    await t.prisma.user.create({
      data: {
        id,
        name: 'Supervisor de prueba',
        email: `fixture-${id}@fixtures.test.invalid`,
        passwordHash: await getTestFixturePasswordHash(),
        role: 'SUPERVISOR',
        areas: { createMany: { data: areaIds.map((areaId) => ({ areaId })) } },
      },
    });
    try {
      await run(id, authHeaders({ id, role: 'SUPERVISOR' }));
    } finally {
      await t.prisma.userArea.deleteMany({ where: { userId: id } });
      await t.prisma.user.delete({ where: { id } });
    }
  };

  // E1: uno de Ventas al día, uno de Operaciones por vencer y uno de Ventas vencido.
  const seedE1 = async () => {
    await seedDocument(t.prisma, {
      areaIds: [VENTAS],
      reviewDate: '2027-02-07',
    });
    await seedDocument(t.prisma, {
      areaIds: [OPERACIONES],
      reviewDate: '2026-11-19',
    });
    await seedDocument(t.prisma, {
      areaIds: [VENTAS],
      reviewDate: '2026-11-04',
    });
  };

  beforeAll(async () => {
    t = await createDocumentsTestApp({ clock: new FixedClock(NOW) });
  });

  afterAll(async () => {
    await t.app.close();
  });

  beforeEach(async () => {
    await cleanDocuments(t.prisma);
  });

  it('E1: el ADMIN ve los totales de todas las áreas', async () => {
    await seedE1();

    expect(await metrics(admin)).toStrictEqual({
      filters: { areaId: null, from: null, to: null },
      totals: {
        active: 3,
        upToDate: 1,
        dueSoon: 1,
        overdue: 1,
        processingFailed: 0,
        uploaded: 3,
      },
    });
  });

  it('E2: cada SUPERVISOR ve solo sus áreas', async () => {
    await seedE1();

    expect((await metrics(supervisorVentas)).totals).toMatchObject({
      active: 2,
      upToDate: 1,
      overdue: 1,
      dueSoon: 0,
    });
    expect((await metrics(supervisorOperaciones)).totals).toMatchObject({
      active: 1,
      dueSoon: 1,
    });
  });

  it('E3: filtro por área', async () => {
    await seedE1();

    const body = await metrics(admin, `?areaId=${OPERACIONES}`);
    expect(body.totals.active).toBe(1);
    expect(body.filters).toEqual({ areaId: OPERACIONES, from: null, to: null });

    expect(
      (await metrics(supervisorVentas, `?areaId=${VENTAS}`)).totals.active,
    ).toBe(2);
  });

  it('E4: área ajena o inexistente', async () => {
    await seedE1();

    for (const areaId of [OPERACIONES, UNKNOWN_AREA]) {
      const response = await get(`?areaId=${areaId}`)
        .set(supervisorVentas)
        .expect(404);
      expect(response.body.message).toBe('No se encontró el área');
    }

    // D14: para el ADMIN un área que no existe no es un error.
    expect(await metrics(admin, `?areaId=${UNKNOWN_AREA}`)).toStrictEqual({
      filters: { areaId: UNKNOWN_AREA, from: null, to: null },
      totals: ZERO,
    });
  });

  it('E5: un empleado no tiene acceso; sin sesión, 401', async () => {
    await get().set(empleadoVentas).expect(403);
    await get().expect(401);
  });

  it('E6: un documento con dos áreas cuenta una vez', async () => {
    await seedDocument(t.prisma, {
      areaIds: [VENTAS, OPERACIONES],
      reviewDate: '2026-11-04',
    });

    expect((await metrics(admin)).totals).toMatchObject({
      active: 1,
      overdue: 1,
      uploaded: 1,
    });
    expect((await metrics(admin, `?areaId=${VENTAS}`)).totals.active).toBe(1);
    await withSupervisor([VENTAS, OPERACIONES], async (_id, headers) => {
      expect((await metrics(headers)).totals).toMatchObject({
        active: 1,
        overdue: 1,
      });
    });
  });

  it('un documento no cuenta para un área que no tiene', async () => {
    await seedDocument(t.prisma, { areaIds: [VENTAS] });

    expect((await metrics(admin, `?areaId=${OPERACIONES}`)).totals).toEqual(
      ZERO,
    );
  });

  it('E7: un archivado vencido, cargado en el período, no cuenta', async () => {
    await seedDocument(t.prisma, {
      areaIds: [VENTAS],
      status: 'ARCHIVED',
      reviewDate: '2026-11-04',
      createdAt: new Date('2026-10-15T15:00:00.000Z'),
    });

    expect((await metrics(admin)).totals).toEqual(ZERO);
    expect(
      (await metrics(admin, '?from=2026-10-10&to=2026-10-31')).totals,
    ).toEqual(ZERO);
  });

  it('E8: error de procesamiento, solo la versión vigente en error', async () => {
    const failed = await seedDocument(t.prisma, { areaIds: [VENTAS] });
    await setProcessingStatus(t.prisma, failed.versionId, 'FAILED');
    // Todavía no se procesó: cuenta en active y en su estado, no en processingFailed.
    await seedDocument(t.prisma, {
      areaIds: [VENTAS],
      reviewDate: '2026-11-04',
    });

    expect((await metrics(admin)).totals).toMatchObject({
      active: 2,
      processingFailed: 1,
      overdue: 1,
    });
  });

  it('E9: cargados en el período, en hora de Argentina', async () => {
    for (const createdAt of [
      '2026-10-01T15:00:00.000Z', // 1/10
      '2026-10-15T15:00:00.000Z', // 15/10
      '2026-11-01T02:30:00.000Z', // 31/10 a las 23:30 en Argentina (1/11 en UTC)
    ]) {
      await seedDocument(t.prisma, {
        areaIds: [VENTAS],
        createdAt: new Date(createdAt),
      });
    }

    const body = await metrics(admin, '?from=2026-10-10&to=2026-10-31');

    expect(body.totals).toMatchObject({ uploaded: 2, active: 3 });
    expect(body.filters).toEqual({
      areaId: null,
      from: '2026-10-10',
      to: '2026-10-31',
    });
    expect((await metrics(admin, '?from=2026-10-10')).totals.uploaded).toBe(2);
    expect((await metrics(admin, '?to=2026-10-14')).totals.uploaded).toBe(1);
  });

  it('bordes del período: del 10/10 a las 00:00 al 31/10 a las 23:59:59 de Argentina', async () => {
    for (const createdAt of [
      '2026-10-10T02:59:59.999Z', // 9/10 a las 23:59:59.999: afuera
      '2026-10-10T03:00:00.000Z', // 10/10 a las 00:00: adentro
      '2026-11-01T02:59:59.999Z', // 31/10 a las 23:59:59.999: adentro
      '2026-11-01T03:00:00.000Z', // 1/11 a las 00:00: afuera
    ]) {
      await seedDocument(t.prisma, {
        areaIds: [VENTAS],
        createdAt: new Date(createdAt),
      });
    }

    expect(
      (await metrics(admin, '?from=2026-10-10&to=2026-10-31')).totals.uploaded,
    ).toBe(2);
  });

  it('E10: fechas inválidas', async () => {
    const response = await get('?from=2026-10-31&to=2026-10-01')
      .set(admin)
      .expect(400);
    expect(response.body.message).toBe(
      'La fecha de inicio no puede ser posterior a la fecha de fin',
    );

    for (const query of [
      '?from=2026-02-30',
      '?to=2026-10-27T10:00:00Z',
      '?areaId=ventas',
      '?userId=x',
    ]) {
      await get(query).set(admin).expect(400);
    }
  });

  it('E11: un área sin documentos da todo en 0', async () => {
    await seedDocument(t.prisma, { areaIds: [VENTAS] });

    expect(await metrics(admin, `?areaId=${OPERACIONES}`)).toStrictEqual({
      filters: { areaId: OPERACIONES, from: null, to: null },
      totals: ZERO,
    });
  });

  it('un SUPERVISOR sin áreas ve todo en 0', async () => {
    await seedE1();

    await withSupervisor([], async (_id, headers) => {
      expect((await metrics(headers)).totals).toEqual(ZERO);
    });
  });

  it('R5: los bordes de "por vencer", con hoy en hora de Argentina', async () => {
    for (const reviewDate of [
      '2026-11-04',
      '2026-11-08', // ayer: último vencido
      '2026-11-09', // hoy: por vencer (en UTC ya sería ayer: vencido)
      '2026-11-19',
      '2026-12-09', // hoy + 30: último por vencer
      '2026-12-10', // hoy + 31: al día
      '2027-02-07',
    ]) {
      await seedDocument(t.prisma, { areaIds: [VENTAS], reviewDate });
    }

    expect((await metrics(admin)).totals).toMatchObject({
      active: 7,
      overdue: 2,
      dueSoon: 3,
      upToDate: 2,
    });
  });

  it('R2: las áreas salen del directorio en cada pedido, no del token', async () => {
    await seedE1();

    await withSupervisor([VENTAS], async (id, headers) => {
      expect((await metrics(headers)).totals.active).toBe(2);

      // Con el mismo token, se lo pasa a Operaciones en la base.
      await t.prisma.userArea.deleteMany({ where: { userId: id } });
      await t.prisma.userArea.create({
        data: { userId: id, areaId: OPERACIONES },
      });

      expect((await metrics(headers)).totals.active).toBe(1);
    });
  });

  it('la ruta de las métricas de procedimientos sigue respondiendo', async () => {
    await request(t.app.getHttpServer())
      .get('/api/metrics/procedures')
      .set(admin)
      .expect(200);
  });
});
