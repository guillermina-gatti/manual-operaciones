/* Procedures metrics end to end over HTTP (HU38): real SQL aggregates, access by
role and area, period filters and abandonment */

import request from 'supertest';
import { AREA_IDS, FIXTURE_USERS } from '../../src/documents/adapters/fixtures';
import {
  FIXTURE_PROCEDURE_VERSIONS,
  PROCEDURE_IDS,
  PROCEDURE_VERSION_IDS,
} from '../../src/executions/adapters/procedure-fixtures';
import type { CatalogStep } from '../../src/executions/ports/procedures-catalog';
import {
  ExecutionsTestApp,
  OTRO_EMPLEADO_VENTAS,
  authHeaders,
  cleanExecutions,
  createExecutionsTestApp,
} from './helpers';

interface StepBody {
  stepId: string;
  reached: number;
  finished: number;
  avgDurationMs: number | null;
  abandoned: number;
  abandonRate: number | null;
}

interface ProcedureBody {
  procedureId: string;
  started: number;
  completed: number;
  inProgress: number;
  abandoned: number;
  completionRate: number | null;
  avgCompletionMs: number | null;
  versions: { procedureVersionId: string; steps: StepBody[] }[];
}

interface MetricsBody {
  areaIds: string[] | null;
  totals: {
    started: number;
    completed: number;
    inProgress: number;
    abandoned: number;
    completionRate: number | null;
  };
  procedures: ProcedureBody[];
}

const CIERRE = PROCEDURE_IDS.cierreDeCaja;
const RECEPCION = PROCEDURE_IDS.recepcionMercaderia;
interface SeedVersion {
  procedureId: string;
  versionId: string;
  steps: CatalogStep[];
}

const stepsOf = (versionId: string) =>
  FIXTURE_PROCEDURE_VERSIONS.find((v) => v.versionId === versionId)!.steps;
const CIERRE_V1: SeedVersion = {
  procedureId: CIERRE,
  versionId: PROCEDURE_VERSION_IDS.cierreDeCajaV1,
  steps: stepsOf(PROCEDURE_VERSION_IDS.cierreDeCajaV1),
};
const CIERRE_V2: SeedVersion = {
  procedureId: CIERRE,
  versionId: PROCEDURE_VERSION_IDS.cierreDeCajaV2,
  steps: stepsOf(PROCEDURE_VERSION_IDS.cierreDeCajaV2),
};
const RECEPCION_V1: SeedVersion = {
  procedureId: RECEPCION,
  versionId: PROCEDURE_VERSION_IDS.recepcionMercaderiaV1,
  steps: stepsOf(PROCEDURE_VERSION_IDS.recepcionMercaderiaV1),
};

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const STEP_MS = 3 * MINUTE;
const hoursAgo = (hours: number) => new Date(Date.now() - hours * HOUR);

describe('Procedures metrics (integration)', () => {
  let t: ExecutionsTestApp;
  let previousTimeZone: string | undefined;
  const http = () => request(t.app.getHttpServer());
  const metrics = (headers: Record<string, string>, query = '') =>
    http().get(`/api/metrics/procedures${query}`).set(headers);

  const admin = authHeaders(FIXTURE_USERS.admin);
  const supervisorVentas = authHeaders(FIXTURE_USERS.supervisorVentas);
  const supervisorOperaciones = authHeaders(
    FIXTURE_USERS.supervisorOperaciones,
  );
  const empleado = authHeaders(FIXTURE_USERS.empleadoVentas);

  // Inserts an execution straight into the database: `finishedSteps` steps of 3
  // minutes each from startedAt, then the current step started (unless all of
  // them finished, which makes it COMPLETED). A user can have only one execution in
  // progress per procedure (executions_one_in_progress_idx), so a second one in
  // progress needs another userId.
  async function seed(
    version: SeedVersion,
    startedAt: Date,
    finishedSteps: number,
    userId: string = FIXTURE_USERS.empleadoVentas.id,
  ): Promise<void> {
    const at = (i: number) => new Date(startedAt.getTime() + i * STEP_MS);
    const completed = finishedSteps === version.steps.length;
    const rows = version.steps
      .slice(0, completed ? finishedSteps : finishedSteps + 1)
      .map((step, i) => ({
        stepId: step.id,
        stepOrder: step.order,
        startedAt: at(i),
        finishedAt: i < finishedSteps ? at(i + 1) : null,
      }));
    await t.prisma.execution.create({
      data: {
        userId,
        procedureId: version.procedureId,
        procedureVersionId: version.versionId,
        status: completed ? 'COMPLETED' : 'IN_PROGRESS',
        startedAt,
        finishedAt: completed ? at(finishedSteps) : null,
        steps: { create: rows },
      },
    });
  }

  const procedure = (body: MetricsBody, procedureId: string) =>
    body.procedures.find((p) => p.procedureId === procedureId);
  const procedureIds = (body: MetricsBody) =>
    body.procedures.map((p) => p.procedureId).sort();

  beforeAll(async () => {
    // Fixed, so the period boundaries below do not depend on the environment.
    previousTimeZone = process.env.APP_TIMEZONE;
    process.env.APP_TIMEZONE = 'America/Argentina/Buenos_Aires';
    t = await createExecutionsTestApp();
  });

  afterAll(async () => {
    await t.app.close();
    if (previousTimeZone === undefined) delete process.env.APP_TIMEZONE;
    else process.env.APP_TIMEZONE = previousTimeZone;
  });

  beforeEach(async () => {
    await cleanExecutions(t.prisma);
    t.catalog.assignAreas(CIERRE, [AREA_IDS.ventas]);
    t.catalog.assignAreas(RECEPCION, [AREA_IDS.operaciones]);
  });

  describe('with executions of both areas', () => {
    beforeEach(async () => {
      // Cierre de caja (Ventas): one completed and one at step 2 since a moment ago.
      await seed(CIERRE_V2, hoursAgo(5), CIERRE_V2.steps.length);
      await seed(CIERRE_V2, hoursAgo(1), 1);
      // Recepción (Operaciones): one completed.
      await seed(RECEPCION_V1, hoursAgo(3), RECEPCION_V1.steps.length);
    });

    it('ADMIN sees every procedure with its counts and step averages', async () => {
      const { body } = await metrics(admin).expect(200);
      const result = body as MetricsBody;

      expect(procedureIds(result)).toEqual([CIERRE, RECEPCION].sort());
      expect(result.areaIds).toBeNull();
      expect(result.totals).toEqual({
        started: 3,
        completed: 2,
        inProgress: 1,
        abandoned: 0,
        completionRate: 2 / 3,
      });

      const cierre = procedure(result, CIERRE)!;
      expect(cierre).toMatchObject({
        started: 2,
        completed: 1,
        inProgress: 1,
        abandoned: 0,
        completionRate: 0.5,
        avgCompletionMs: CIERRE_V2.steps.length * STEP_MS,
      });
      const [first, second, third] = cierre.versions[0].steps;
      expect(first).toMatchObject({
        reached: 2,
        finished: 2,
        avgDurationMs: STEP_MS,
        abandoned: 0,
      });
      expect(second).toMatchObject({
        reached: 2,
        finished: 1,
        avgDurationMs: STEP_MS,
        abandoned: 0,
        abandonRate: 0,
      });
      expect(third).toMatchObject({ reached: 1, finished: 1 });
    });

    it('never includes who ran the executions', async () => {
      const response = await metrics(admin).expect(200);

      expect(response.text).not.toContain(FIXTURE_USERS.empleadoVentas.id);
    });

    it('ADMIN filtering by area sees only the procedures of that area', async () => {
      const { body } = await metrics(
        admin,
        `?areaId=${AREA_IDS.operaciones}`,
      ).expect(200);

      expect(procedureIds(body as MetricsBody)).toEqual([RECEPCION]);
      expect((body as MetricsBody).totals.started).toBe(1);
    });

    it('a supervisor of Ventas sees only Ventas, with or without the area in the filter', async () => {
      const all = await metrics(supervisorVentas).expect(200);
      const filtered = await metrics(
        supervisorVentas,
        `?areaId=${AREA_IDS.ventas}`,
      ).expect(200);

      expect(procedureIds(all.body as MetricsBody)).toEqual([CIERRE]);
      expect((all.body as MetricsBody).areaIds).toEqual([AREA_IDS.ventas]);
      expect(filtered.body).toEqual(
        expect.objectContaining({
          procedures: (all.body as MetricsBody).procedures,
        }),
      );
    });

    it('a supervisor of Ventas asking for Operaciones gets a 404', async () => {
      const response = await metrics(
        supervisorVentas,
        `?areaId=${AREA_IDS.operaciones}`,
      ).expect(404);

      expect(response.body.message).toBe('No se encontró el área');
      expect(response.text).not.toContain(RECEPCION);
    });

    it('a supervisor of Operaciones does not see Ventas', async () => {
      const { body } = await metrics(supervisorOperaciones).expect(200);

      expect(procedureIds(body as MetricsBody)).toEqual([RECEPCION]);
    });

    it('a procedure moved to another area leaves the supervisor view at once', async () => {
      t.catalog.assignAreas(CIERRE, [AREA_IDS.operaciones]);

      const { body } = await metrics(supervisorVentas).expect(200);

      expect((body as MetricsBody).procedures).toEqual([]);
    });
  });

  it('401 without a session and 403 for EMPLOYEE', async () => {
    await http().get('/api/metrics/procedures').expect(401);
    await metrics(empleado).expect(403);
  });

  it('keeps each version with its own steps', async () => {
    await seed(CIERRE_V1, hoursAgo(48), CIERRE_V1.steps.length);
    await seed(CIERRE_V2, hoursAgo(2), CIERRE_V2.steps.length);

    const { body } = await metrics(admin).expect(200);
    const cierre = procedure(body as MetricsBody, CIERRE)!;

    expect(cierre.started).toBe(2);
    expect(cierre.versions.map((v) => v.procedureVersionId)).toEqual([
      CIERRE_V2.versionId,
      CIERRE_V1.versionId,
    ]);
    expect(cierre.versions.map((v) => v.steps.length)).toEqual([
      CIERRE_V2.steps.length,
      CIERRE_V1.steps.length,
    ]);
  });

  describe('period', () => {
    beforeEach(async () => {
      // Buenos Aires is UTC-3.
      await seed(CIERRE_V2, new Date('2026-02-15T15:00:00.000Z'), 4); // Feb: out
      await seed(CIERRE_V2, new Date('2026-03-01T03:00:00.000Z'), 4); // Mar 1, 00:00: in
      await seed(CIERRE_V2, new Date('2026-03-15T15:00:00.000Z'), 4); // in
      await seed(CIERRE_V2, new Date('2026-04-01T02:30:00.000Z'), 4); // Mar 31, 23:30: in
      await seed(CIERRE_V2, new Date('2026-04-01T03:30:00.000Z'), 4); // Apr 1, 00:30: out
    });

    it('from and to are whole company days and leave out what started outside', async () => {
      const { body } = await metrics(
        admin,
        '?from=2026-03-01&to=2026-03-31',
      ).expect(200);

      expect((body as MetricsBody).totals.started).toBe(3);
    });

    it('only from, or only to, limits one side', async () => {
      const since = await metrics(admin, '?from=2026-03-01').expect(200);
      const until = await metrics(admin, '?to=2026-02-28').expect(200);

      expect((since.body as MetricsBody).totals.started).toBe(4);
      expect((until.body as MetricsBody).totals.started).toBe(1);
    });

    it('a period without executions is empty, with null rates', async () => {
      const { body } = await metrics(
        admin,
        '?from=2020-01-01&to=2020-01-31',
      ).expect(200);

      expect(body).toMatchObject({
        totals: {
          started: 0,
          completed: 0,
          inProgress: 0,
          abandoned: 0,
          completionRate: null,
        },
        procedures: [],
      });
    });
  });

  it('with no executions at all the answer is empty, not an error', async () => {
    const { body } = await metrics(supervisorVentas).expect(200);

    expect((body as MetricsBody).procedures).toEqual([]);
  });

  it.each([
    ['a day that does not exist', '?from=2026-02-30'],
    ['a date-time instead of a day', '?to=2026-10-27T10:00:00Z'],
    ['from after to', '?from=2026-10-28&to=2026-10-27'],
    ['an areaId that is not a UUID', '?areaId=ventas'],
  ])('400 with %s', async (_case, query) => {
    await metrics(admin, query).expect(400);
  });

  it('a step still running after more than 24 hours counts as abandoned', async () => {
    // Both at step 2, run by two employees: one started it 25 hours ago, the other
    // 23 hours ago.
    await seed(CIERRE_V2, new Date(Date.now() - 25 * HOUR - STEP_MS), 1);
    await seed(
      CIERRE_V2,
      new Date(Date.now() - 23 * HOUR - STEP_MS),
      1,
      OTRO_EMPLEADO_VENTAS.id,
    );
    await seed(CIERRE_V2, hoursAgo(30), CIERRE_V2.steps.length);

    const { body } = await metrics(admin).expect(200);
    const cierre = procedure(body as MetricsBody, CIERRE)!;

    expect(cierre).toMatchObject({
      started: 3,
      completed: 1,
      inProgress: 1,
      abandoned: 1,
    });
    const [first, second] = cierre.versions[0].steps;
    expect(first).toMatchObject({ reached: 3, abandoned: 0, abandonRate: 0 });
    expect(second).toMatchObject({
      reached: 3,
      finished: 1,
      abandoned: 1,
      abandonRate: 1 / 3,
    });
    expect((body as MetricsBody).totals.abandoned).toBe(1);
  });
});
