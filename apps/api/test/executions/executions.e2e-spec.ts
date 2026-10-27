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
  status: 'IN_PROGRESS' | 'COMPLETED';
  finishedAt: string | null;
  currentStepId: string | null;
  steps: {
    stepId: string;
    startedAt: string | null;
    finishedAt: string | null;
    durationMs: number | null;
  }[];
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

  it('401 without a session and 403 for ADMIN', async () => {
    await http()
      .post('/api/executions')
      .send({ procedureId: CIERRE })
      .expect(401);
    await start(authHeaders(FIXTURE_USERS.admin)).expect(403);
  });
});
