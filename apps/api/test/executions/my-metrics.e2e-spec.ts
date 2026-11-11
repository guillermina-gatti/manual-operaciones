/* Personal metrics of the employee end to end over HTTP (GET /metrics/me): real SQL, only
the executions of the user of the session, active areas, company days and abandonment */

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
  closeExecutionsTestApp,
  createExecutionsTestApp,
} from './helpers';

interface ResumeBody {
  executionId: string;
  procedureId: string;
  currentStep: { stepId: string; order: number; title: string };
  totalSteps: number;
  lastActivityAt: string;
  stale: boolean;
}

interface ProcedureBody {
  procedureId: string;
  started: number;
  completed: number;
  inProgress: number;
  abandoned: number;
  avgCompletionMs: number | null;
  slowestStep: { order: number; title: string; avgDurationMs: number } | null;
}

interface MyMetricsBody {
  areaIds: string[];
  totals: {
    started: number;
    completed: number;
    inProgress: number;
    abandoned: number;
    avgCompletionMs: number | null;
  };
  resume: ResumeBody[];
  procedures: ProcedureBody[];
}

interface SeedVersion {
  procedureId: string;
  versionId: string;
  steps: CatalogStep[];
}

const CIERRE = PROCEDURE_IDS.cierreDeCaja;
const RECEPCION = PROCEDURE_IDS.recepcionMercaderia;
const stepsOf = (versionId: string) =>
  FIXTURE_PROCEDURE_VERSIONS.find((v) => v.versionId === versionId)!.steps;
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

const ELENA = FIXTURE_USERS.empleadoVentas;

describe('Personal metrics of the employee (integration)', () => {
  let t: ExecutionsTestApp;
  let previousTimeZone: string | undefined;
  const http = () => request(t.app.getHttpServer());
  const mine = (headers: Record<string, string>, query = '') =>
    http().get(`/api/metrics/me${query}`).set(headers);

  const elena = authHeaders(ELENA);
  const otra = authHeaders(OTRO_EMPLEADO_VENTAS);

  // Inserts an execution straight into the database: `finishedSteps` steps of
  // `stepMs` each from startedAt, then the current step started (unless all of them
  // finished, which makes it COMPLETED). One in progress per user and procedure.
  async function seed(
    version: SeedVersion,
    startedAt: Date,
    finishedSteps: number,
    userId: string = ELENA.id,
    stepMs: number = STEP_MS,
  ): Promise<string> {
    const at = (i: number) => new Date(startedAt.getTime() + i * stepMs);
    const completed = finishedSteps === version.steps.length;
    const rows = version.steps
      .slice(0, completed ? finishedSteps : finishedSteps + 1)
      .map((step, i) => ({
        stepId: step.id,
        stepOrder: step.order,
        startedAt: at(i),
        finishedAt: i < finishedSteps ? at(i + 1) : null,
      }));
    const execution = await t.prisma.execution.create({
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
    return execution.id;
  }

  beforeAll(async () => {
    // Fixed, so the period boundaries below do not depend on the environment.
    previousTimeZone = process.env.APP_TIMEZONE;
    process.env.APP_TIMEZONE = 'America/Argentina/Buenos_Aires';
    t = await createExecutionsTestApp();
  });

  afterAll(async () => {
    await closeExecutionsTestApp(t);
    if (previousTimeZone === undefined) delete process.env.APP_TIMEZONE;
    else process.env.APP_TIMEZONE = previousTimeZone;
  });

  beforeEach(async () => {
    await cleanExecutions(t.prisma);
    t.catalog.assignAreas(CIERRE, [AREA_IDS.ventas]);
    t.catalog.assignAreas(RECEPCION, [AREA_IDS.operaciones]);
  });

  describe('only their own executions', () => {
    let current: string;

    beforeEach(async () => {
      // Elena: one Cierre de caja completed and one at step 2 since an hour ago.
      await seed(CIERRE_V2, hoursAgo(5), CIERRE_V2.steps.length);
      current = await seed(CIERRE_V2, hoursAgo(2), 1);
      // The other Ventas employee: two completed and one in progress, much slower.
      await seed(
        CIERRE_V2,
        hoursAgo(8),
        CIERRE_V2.steps.length,
        OTRO_EMPLEADO_VENTAS.id,
        30 * MINUTE,
      );
      await seed(
        CIERRE_V2,
        hoursAgo(7),
        CIERRE_V2.steps.length,
        OTRO_EMPLEADO_VENTAS.id,
        30 * MINUTE,
      );
      await seed(CIERRE_V2, hoursAgo(3), 2, OTRO_EMPLEADO_VENTAS.id);
    });

    it('Elena sees her counts, her average and her slowest step, never the others', async () => {
      const { body } = await mine(elena).expect(200);
      const result = body as MyMetricsBody;

      expect(result.areaIds).toEqual([AREA_IDS.ventas]);
      expect(result.totals).toEqual({
        started: 2,
        completed: 1,
        inProgress: 1,
        abandoned: 0,
        avgCompletionMs: CIERRE_V2.steps.length * STEP_MS,
      });
      expect(result.procedures).toHaveLength(1);
      expect(result.procedures[0]).toMatchObject({
        procedureId: CIERRE,
        started: 2,
        completed: 1,
        avgCompletionMs: CIERRE_V2.steps.length * STEP_MS,
      });
      expect(result.procedures[0].slowestStep?.avgDurationMs).toBe(STEP_MS);
    });

    it('the other employee sees only theirs', async () => {
      const { body } = await mine(otra).expect(200);

      expect((body as MyMetricsBody).totals).toMatchObject({
        started: 3,
        completed: 2,
      });
    });

    it('lists her execution to resume, with its current step', async () => {
      const { body } = await mine(elena).expect(200);
      const { resume } = body as MyMetricsBody;

      expect(resume).toHaveLength(1);
      expect(resume[0]).toMatchObject({
        executionId: current,
        procedureTitle: 'Cierre de caja',
        procedureId: CIERRE,
        currentStep: {
          stepId: CIERRE_V2.steps[1].id,
          order: 2,
          title: CIERRE_V2.steps[1].title,
        },
        totalSteps: CIERRE_V2.steps.length,
        stale: false,
      });
    });

    it('never includes a user id', async () => {
      const response = await mine(elena).expect(200);

      expect(response.text).not.toContain(ELENA.id);
      expect(response.text).not.toContain(OTRO_EMPLEADO_VENTAS.id);
    });

    it('a userId in the query is a 400: the user is always the one of the session', async () => {
      await mine(elena, `?userId=${OTRO_EMPLEADO_VENTAS.id}`).expect(400);
    });
  });

  it('401 without a session, 403 for ADMIN and SUPERVISOR', async () => {
    await http().get('/api/metrics/me').expect(401);
    await mine(authHeaders(FIXTURE_USERS.admin)).expect(403);
    await mine(authHeaders(FIXTURE_USERS.supervisorVentas)).expect(403);
  });

  describe('areas', () => {
    beforeEach(async () => {
      await seed(CIERRE_V2, hoursAgo(5), CIERRE_V2.steps.length);
    });

    afterEach(async () => {
      await t.prisma.area.update({
        where: { id: AREA_IDS.ventas },
        data: { isActive: true },
      });
    });

    it('filtering by her area gives the same; another area is a 404', async () => {
      const filtered = await mine(elena, `?areaId=${AREA_IDS.ventas}`).expect(
        200,
      );
      expect((filtered.body as MyMetricsBody).totals.started).toBe(1);

      const response = await mine(
        elena,
        `?areaId=${AREA_IDS.operaciones}`,
      ).expect(404);
      expect(response.body.message).toBe('No se encontró el área');
    });

    it('a procedure moved out of her areas leaves her metrics and the resume list', async () => {
      await seed(CIERRE_V2, hoursAgo(1), 1);
      t.catalog.assignAreas(CIERRE, [AREA_IDS.operaciones]);

      const { body } = await mine(elena).expect(200);

      expect((body as MyMetricsBody).procedures).toEqual([]);
      expect((body as MyMetricsBody).resume).toEqual([]);
    });

    it('with her area inactive she sees nothing, and asking for it is a 404', async () => {
      await t.prisma.area.update({
        where: { id: AREA_IDS.ventas },
        data: { isActive: false },
      });

      const { body } = await mine(elena).expect(200);
      expect((body as MyMetricsBody).areaIds).toEqual([]);
      expect((body as MyMetricsBody).totals.started).toBe(0);

      await mine(elena, `?areaId=${AREA_IDS.ventas}`).expect(404);
    });
  });

  describe('period', () => {
    it('from and to are whole company days; the resume list ignores them', async () => {
      // 10/10 at 00:30 in Buenos Aires (03:30 UTC): inside a period that starts on 10/10.
      await seed(
        CIERRE_V2,
        new Date('2026-10-10T03:30:00.000Z'),
        CIERRE_V2.steps.length,
      );
      // 09/10 at 23:30 in Buenos Aires: outside.
      await seed(
        CIERRE_V2,
        new Date('2026-10-10T02:30:00.000Z'),
        CIERRE_V2.steps.length,
      );
      // In progress since long before the period.
      await seed(RECEPCION_V1, new Date('2026-09-01T13:00:00.000Z'), 0);
      t.catalog.assignAreas(RECEPCION, [AREA_IDS.ventas]);

      const { body } = await mine(
        elena,
        '?from=2026-10-10&to=2026-10-31',
      ).expect(200);
      const result = body as MyMetricsBody;

      expect(result.totals.started).toBe(1);
      expect(result.resume.map((r) => r.procedureId)).toEqual([RECEPCION]);
    });

    it('from after to is a 400; a day that does not exist too', async () => {
      await mine(elena, '?from=2026-10-31&to=2026-10-01').expect(400);
      await mine(elena, '?from=2026-02-30').expect(400);
    });

    it('with no executions the answer is empty, not an error', async () => {
      const { body } = await mine(elena).expect(200);

      expect(body).toMatchObject({
        totals: {
          started: 0,
          completed: 0,
          inProgress: 0,
          abandoned: 0,
          avgCompletionMs: null,
        },
        resume: [],
        procedures: [],
      });
    });
  });

  it('HU33: a RESTARTED execution counts nowhere and is not in the resume list', async () => {
    const old = await seed(CIERRE_V2, hoursAgo(30), 1);
    await t.prisma.execution.update({
      where: { id: old },
      data: { status: 'RESTARTED', finishedAt: hoursAgo(2) },
    });
    const fresh = await seed(CIERRE_V2, hoursAgo(2), 1);

    const { body } = await mine(elena).expect(200);
    const result = body as MyMetricsBody;

    expect(result.totals).toMatchObject({
      started: 1,
      completed: 0,
      inProgress: 1,
      abandoned: 0,
    });
    expect(result.totals.started).toBe(
      result.totals.completed +
        result.totals.inProgress +
        result.totals.abandoned,
    );
    expect(result.resume.map((r) => r.executionId)).toEqual([fresh]);
    expect(result.procedures[0]).toMatchObject({ started: 1, abandoned: 0 });
  });

  it('a step still running after more than 24 hours: abandoned in the totals, stale in the resume list', async () => {
    await seed(CIERRE_V2, hoursAgo(30), 1);

    const { body } = await mine(elena).expect(200);
    const result = body as MyMetricsBody;

    expect(result.totals).toMatchObject({ inProgress: 0, abandoned: 1 });
    expect(result.resume).toHaveLength(1);
    expect(result.resume[0].stale).toBe(true);
  });
});
