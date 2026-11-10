/* Step-by-step execution end to end over HTTP (spec 005, CA1–CA4) */

import request from 'supertest';
import { AREA_IDS, FIXTURE_USERS } from '../../src/documents/adapters/fixtures';
import {
  FIXTURE_PROCEDURE_VERSIONS,
  PROCEDURE_IDS,
  PROCEDURE_VERSION_IDS,
} from '../../src/executions/adapters/procedure-fixtures';
import {
  ExecutionsTestApp,
  OTRO_EMPLEADO_VENTAS,
  authHeaders,
  cleanExecutions,
  createExecutionsTestApp,
} from './helpers';

interface ExecutionBody {
  id: string;
  procedureVersionId: string;
  status: 'IN_PROGRESS' | 'COMPLETED' | 'RESTARTED';
  finishedAt: string | null;
  currentStepId: string | null;
  steps: {
    stepId: string;
    startedAt: string | null;
    finishedAt: string | null;
    durationMs: number | null;
  }[];
  versionChange: {
    changed: boolean;
    critical: boolean;
    currentVersionId: string | null;
    currentVersionNumber: number | null;
    changes: {
      versionNumber: number;
      isCritical: boolean;
      changeSummary: string | null;
    }[];
  };
}

const CIERRE = PROCEDURE_IDS.cierreDeCaja;
const V2_STEPS = FIXTURE_PROCEDURE_VERSIONS.find(
  (v) => v.versionId === PROCEDURE_VERSION_IDS.cierreDeCajaV2,
)!.steps;
const MISSING = '1d000000-0000-4000-8000-000000000099';

describe('Executions (integration)', () => {
  let t: ExecutionsTestApp;
  const ventas = authHeaders(FIXTURE_USERS.empleadoVentas);
  const otroVentas = authHeaders(OTRO_EMPLEADO_VENTAS);
  const operaciones = authHeaders(FIXTURE_USERS.empleadoOperaciones);
  const http = () => request(t.app.getHttpServer());

  const start = (headers: Record<string, string>) =>
    http().post('/api/executions').set(headers).send({ procedureId: CIERRE });
  const complete = (id: string, stepId: string) =>
    http().post(`/api/executions/${id}/steps/${stepId}/complete`).set(ventas);

  beforeAll(async () => {
    t = await createExecutionsTestApp();
  });

  afterAll(async () => {
    await t.app.close();
  });

  beforeEach(async () => {
    await cleanExecutions(t.prisma);
    t.catalog.assignAreas(CIERRE, [AREA_IDS.ventas]);
  });

  it('full flow: start 201, start again 200, complete every step, COMPLETED', async () => {
    const created = await start(ventas).expect(201);
    const execution = created.body as ExecutionBody;
    expect(execution).toMatchObject({
      procedureVersionId: PROCEDURE_VERSION_IDS.cierreDeCajaV2,
      status: 'IN_PROGRESS',
      currentStepId: V2_STEPS[0].id,
    });

    const again = await start(ventas).expect(200);
    expect((again.body as ExecutionBody).id).toBe(execution.id);

    let last: ExecutionBody = execution;
    for (const [i, step] of V2_STEPS.entries()) {
      const response = await complete(execution.id, step.id).expect(200);
      last = response.body as ExecutionBody;
      expect(last.currentStepId).toBe(V2_STEPS[i + 1]?.id ?? null);
    }

    expect(last.status).toBe('COMPLETED');
    expect(last.finishedAt).toBe(last.steps.at(-1)?.finishedAt);
    last.steps.forEach((step, i) => {
      expect(step.durationMs).toBe(
        Date.parse(step.finishedAt!) - Date.parse(step.startedAt!),
      );
      // Each step starts when the previous one finished.
      if (i > 0) expect(step.startedAt).toBe(last.steps[i - 1].finishedAt);
    });

    const found = await http()
      .get(`/api/executions/${execution.id}`)
      .set(ventas)
      .expect(200);
    expect(found.body).toEqual(last);

    const after = await complete(execution.id, V2_STEPS[3].id).expect(409);
    expect(after.body.reason).toBe('EXECUTION_COMPLETED');
  });

  it('CA1: an execution stays on its version after another one is published', async () => {
    t.catalog.publish(PROCEDURE_VERSION_IDS.cierreDeCajaV1);
    try {
      const { body } = await start(ventas).expect(201);
      t.catalog.publish(PROCEDURE_VERSION_IDS.cierreDeCajaV2);

      const found = await http()
        .get(`/api/executions/${(body as ExecutionBody).id}`)
        .set(ventas)
        .expect(200);

      expect((found.body as ExecutionBody).procedureVersionId).toBe(
        PROCEDURE_VERSION_IDS.cierreDeCajaV1,
      );
      expect((found.body as ExecutionBody).steps).toHaveLength(3);
    } finally {
      t.catalog.publish(PROCEDURE_VERSION_IDS.cierreDeCajaV2);
    }
  });

  describe('HU33: the procedure changed while it runs', () => {
    const V1 = PROCEDURE_VERSION_IDS.cierreDeCajaV1;
    const V2 = PROCEDURE_VERSION_IDS.cierreDeCajaV2;
    const V3 = '1b000000-0000-4000-8000-000000000009';

    // An execution of Elena started on v1, while v1 was the published version.
    const startOnV1 = async () => {
      t.catalog.publish(V1);
      const { body } = await start(ventas).expect(201);
      return body as ExecutionBody;
    };
    const get = (id: string) =>
      http().get(`/api/executions/${id}`).set(ventas).expect(200);

    // v3, a critical change, as a draft: each test publishes it when it needs it.
    const addCriticalV3 = () =>
      t.catalog.addVersion({
        ...FIXTURE_PROCEDURE_VERSIONS.find((v) => v.versionId === V2)!,
        versionId: V3,
        versionNumber: 3,
        isCritical: true,
        changeSummary: 'Cambia el límite de caja',
        published: false,
      });

    afterEach(() => {
      t.catalog.publish(V2);
    });

    it('a new execution has no change', async () => {
      const { body } = await start(ventas).expect(201);

      expect((body as ExecutionBody).versionChange).toEqual({
        changed: false,
        critical: false,
        currentVersionId: null,
        currentVersionNumber: null,
        changes: [],
      });
    });

    it('opening it after v2 is published tells the change, and it stays on v1', async () => {
      const execution = await startOnV1();
      t.catalog.publish(V2);

      const found = (await get(execution.id)).body as ExecutionBody;

      expect(found.procedureVersionId).toBe(V1);
      expect(found.versionChange).toMatchObject({
        changed: true,
        critical: false,
        currentVersionId: V2,
        currentVersionNumber: 2,
        changes: [{ versionNumber: 2, isCritical: false }],
      });
    });

    it('resuming it (start again, 200) tells the change too', async () => {
      await startOnV1();
      t.catalog.publish(V2);

      const { body } = await start(ventas).expect(200);

      expect((body as ExecutionBody).versionChange.changed).toBe(true);
    });

    it('a critical version in between makes it critical, with its summary', async () => {
      const execution = await startOnV1();
      addCriticalV3();
      t.catalog.publish(V2);
      t.catalog.publish(V3);

      const found = (await get(execution.id)).body as ExecutionBody;

      // Moving on is blocked until it restarts.
      const blocked = await complete(
        execution.id,
        execution.steps[0].stepId,
      ).expect(409);
      expect(blocked.body.reason).toBe('PROCEDURE_CHANGED_CRITICAL');
      expect(found.versionChange).toMatchObject({
        changed: true,
        critical: true,
        currentVersionId: V3,
        changes: [
          { versionNumber: 2, isCritical: false },
          {
            versionNumber: 3,
            isCritical: true,
            changeSummary: 'Cambia el límite de caja',
          },
        ],
      });
    });

    const restart = (id: string, headers = ventas) =>
      http().post(`/api/executions/${id}/restart`).set(headers);

    it('restart: 201 with a new execution on v2 from step 1; the old one is RESTARTED', async () => {
      const old = await startOnV1();
      t.catalog.publish(V2);

      const { body } = await restart(old.id).expect(201);
      const fresh = body as ExecutionBody;

      expect(fresh.id).not.toBe(old.id);
      expect(fresh).toMatchObject({
        procedureVersionId: V2,
        status: 'IN_PROGRESS',
        currentStepId: V2_STEPS[0].id,
        versionChange: { changed: false },
      });
      const closed = (await get(old.id)).body as ExecutionBody;
      expect(closed).toMatchObject({
        status: 'RESTARTED',
        currentStepId: null,
        versionChange: { changed: false },
      });
      expect(closed.finishedAt).toBe(fresh.steps[0].startedAt);

      // Starting again gives the new one; the old one cannot move.
      const again = await start(ventas).expect(200);
      expect((again.body as ExecutionBody).id).toBe(fresh.id);
      const moved = await complete(old.id, old.steps[0].stepId).expect(409);
      expect(moved.body.reason).toBe('EXECUTION_RESTARTED');
    });

    it('two restarts at once: one 201, the other 409 EXECUTION_RESTARTED, one in progress', async () => {
      const old = await startOnV1();
      t.catalog.publish(V2);

      const responses = await Promise.all([restart(old.id), restart(old.id)]);

      expect(responses.map((r) => r.status).sort((a, b) => a - b)).toEqual([
        201, 409,
      ]);
      expect(responses.find((r) => r.status === 409)!.body.reason).toBe(
        'EXECUTION_RESTARTED',
      );
      const inProgress = await t.prisma.execution.count({
        where: {
          userId: FIXTURE_USERS.empleadoVentas.id,
          procedureId: CIERRE,
          status: 'IN_PROGRESS',
        },
      });
      expect(inProgress).toBe(1);
    });

    it('restart without a change of version: 409 PROCEDURE_NOT_CHANGED', async () => {
      const { body } = await start(ventas).expect(201);

      const response = await restart((body as ExecutionBody).id).expect(409);

      expect(response.body.reason).toBe('PROCEDURE_NOT_CHANGED');
    });

    it("restart someone else's execution: the same 404 as a missing one", async () => {
      const old = await startOnV1();
      t.catalog.publish(V2);

      const response = await restart(old.id, otroVentas).expect(404);
      const missing = await restart(MISSING).expect(404);

      expect(response.body).toEqual(missing.body);
    });

    it('restart: 401 without a session, 403 for ADMIN and SUPERVISOR', async () => {
      const old = await startOnV1();
      t.catalog.publish(V2);

      await http().post(`/api/executions/${old.id}/restart`).expect(401);
      await restart(old.id, authHeaders(FIXTURE_USERS.admin)).expect(403);
      await restart(old.id, authHeaders(FIXTURE_USERS.supervisorVentas)).expect(
        403,
      );
    });

    it('after a critical change, restarting lets the new execution move on', async () => {
      const execution = await startOnV1();
      addCriticalV3();
      t.catalog.publish(V2);
      t.catalog.publish(V3);

      const { body } = await restart(execution.id).expect(201);
      const fresh = body as ExecutionBody;
      const moved = await complete(fresh.id, fresh.steps[0].stepId).expect(200);

      expect(fresh.procedureVersionId).toBe(V3);
      expect((moved.body as ExecutionBody).status).toBe('IN_PROGRESS');
    });

    it('a completed execution never shows a change', async () => {
      const execution = await startOnV1();
      const v1Steps = FIXTURE_PROCEDURE_VERSIONS.find(
        (v) => v.versionId === V1,
      )!.steps;
      for (const step of v1Steps) {
        await complete(execution.id, step.id).expect(200);
      }
      t.catalog.publish(V2);

      const found = (await get(execution.id)).body as ExecutionBody;

      expect(found.status).toBe('COMPLETED');
      expect(found.versionChange.changed).toBe(false);
      const response = await restart(execution.id).expect(409);
      expect(response.body.reason).toBe('EXECUTION_COMPLETED');
    });
  });

  it('409 for a finished step and for a step out of order', async () => {
    const { body } = await start(ventas).expect(201);
    const id = (body as ExecutionBody).id;
    await complete(id, V2_STEPS[0].id).expect(200);

    const finished = await complete(id, V2_STEPS[0].id).expect(409);
    const outOfOrder = await complete(id, V2_STEPS[3].id).expect(409);

    expect(finished.body.reason).toBe('STEP_ALREADY_FINISHED');
    expect(outOfOrder.body.reason).toBe('STEP_OUT_OF_ORDER');
  });

  describe('CA4: cross-employee 404', () => {
    let id: string;

    beforeEach(async () => {
      ({
        body: { id },
      } = await start(ventas).expect(201));
    });

    it('another employee of the same area gets the same 404 as a missing execution', async () => {
      const foreign = await http()
        .get(`/api/executions/${id}`)
        .set(otroVentas)
        .expect(404);
      const missing = await http()
        .get(`/api/executions/${MISSING}`)
        .set(otroVentas)
        .expect(404);

      expect(foreign.body).toEqual(missing.body);
      await http()
        .post(`/api/executions/${id}/steps/${V2_STEPS[0].id}/complete`)
        .set(otroVentas)
        .expect(404);
    });

    it('an employee of another area gets 404 too', async () => {
      await http().get(`/api/executions/${id}`).set(operaciones).expect(404);
    });

    it('the other employee starts their own execution instead of getting this one', async () => {
      const own = await start(otroVentas).expect(201);

      expect((own.body as ExecutionBody).id).not.toBe(id);
    });
  });

  it('404 after the procedure is moved to another area', async () => {
    const { body } = await start(ventas).expect(201);
    const id = (body as ExecutionBody).id;

    t.catalog.assignAreas(CIERRE, [AREA_IDS.operaciones]);

    await http().get(`/api/executions/${id}`).set(ventas).expect(404);
    await complete(id, V2_STEPS[0].id).expect(404);
    await start(ventas).expect(404);
    const rows = await t.prisma.executionStep.count({
      where: { executionId: id },
    });
    expect(rows).toBe(1);
  });

  it('401 without a session and 403 for ADMIN and SUPERVISOR', async () => {
    await http()
      .post('/api/executions')
      .send({ procedureId: CIERRE })
      .expect(401);
    await start(authHeaders(FIXTURE_USERS.admin)).expect(403);
    await start(authHeaders(FIXTURE_USERS.supervisorVentas)).expect(403);
  });
});
