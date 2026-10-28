/* Drafts and steps end to end over HTTP against the test database (spec 006, E1–E16) */

import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { FIXTURE_USERS } from '../../src/documents/adapters/fixtures';
import { cleanProcedures, seedProcedure } from './helpers';
import {
  ProceduresTestApp,
  authHeaders,
  createProceduresTestApp,
} from './app-helpers';

interface VersionBody {
  id: string;
  procedureId: string;
  versionNumber: number;
  status: 'DRAFT' | 'PUBLISHED' | 'SUPERSEDED';
  title: string;
  stepCount: number;
}

interface ProcedureBody {
  id: string;
  versions: VersionBody[];
}

interface StepBody {
  id: string;
  order: number;
  title: string;
}

const NOT_FOUND_PROCEDURE = 'No se encontró el procedimiento';

describe('Procedures: drafts and steps (integration)', () => {
  let t: ProceduresTestApp;
  const admin = authHeaders(FIXTURE_USERS.admin);
  const supervisor = authHeaders(FIXTURE_USERS.supervisorVentas);
  const employee = authHeaders(FIXTURE_USERS.empleadoVentas);
  const http = () => request(t.app.getHttpServer());

  const versionPath = (procedureId: string, versionId: string) =>
    `/api/procedures/${procedureId}/versions/${versionId}`;

  // A procedure created through the API: returns the ids of its version 1 draft.
  const createViaApi = async (title = 'Cierre de caja') => {
    const { body } = await http()
      .post('/api/procedures')
      .set(admin)
      .send({ title })
      .expect(201);
    const procedure = body as ProcedureBody;
    return { procedureId: procedure.id, versionId: procedure.versions[0].id };
  };

  const addStep = (
    draft: { procedureId: string; versionId: string },
    title: string,
    position?: number,
  ) =>
    http()
      .post(`${versionPath(draft.procedureId, draft.versionId)}/steps`)
      .set(admin)
      .send(position === undefined ? { title } : { title, position });

  // The steps of a version as stored, by order.
  const storedSteps = (versionId: string) =>
    t.prisma.step.findMany({
      where: { procedureVersionId: versionId },
      orderBy: { stepOrder: 'asc' },
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

  it('E1: an ADMIN creates a procedure: 201, version 1 as DRAFT, no internal fields', async () => {
    const { body } = await http()
      .post('/api/procedures')
      .set(admin)
      .send({ title: 'Cierre de caja', description: 'Al final del día' })
      .expect(201);

    expect(body).not.toHaveProperty('ownerId');
    const procedure = body as ProcedureBody;
    expect(procedure.versions).toHaveLength(1);
    expect(procedure.versions[0]).toMatchObject({
      versionNumber: 1,
      status: 'DRAFT',
      title: 'Cierre de caja',
      stepCount: 0,
    });
    expect(procedure.versions[0]).not.toHaveProperty('createdById');
  });

  it('E2: without a session 401, and a SUPERVISOR or an EMPLOYEE get 403 with nothing written', async () => {
    const draft = await seedProcedure(t.prisma, {
      versions: [{ versionNumber: 1, status: 'DRAFT' }],
    });
    const step = `${versionPath(draft.procedureId, draft.versionIds[0])}/steps`;

    await http().post('/api/procedures').send({ title: 'X' }).expect(401);
    for (const headers of [supervisor, employee]) {
      await http()
        .post('/api/procedures')
        .set(headers)
        .send({ title: 'X' })
        .expect(403);
      await http().post(step).set(headers).send({ title: 'Paso' }).expect(403);
    }

    expect(await t.prisma.procedure.count()).toBe(1);
    expect(await storedSteps(draft.versionIds[0])).toHaveLength(0);
  });

  it.each([
    ['empty', ''],
    ['only spaces', '   '],
    ['over 200 characters', 'a'.repeat(201)],
  ])('E3: a %s title is 400 naming the field', async (_name, title) => {
    const { body } = await http()
      .post('/api/procedures')
      .set(admin)
      .send({ title })
      .expect(400);

    expect(JSON.stringify(body)).toContain('title');
    expect(await t.prisma.procedure.count()).toBe(0);
  });

  it('E4–E7: add, insert, delete and reorder keep the order 1..n without gaps', async () => {
    const draft = await createViaApi();

    for (const title of ['A', 'B', 'C']) {
      await addStep(draft, title).expect(201);
    }
    expect((await storedSteps(draft.versionId)).map((s) => s.title)).toEqual([
      'A',
      'B',
      'C',
    ]);

    await addStep(draft, 'X', 2).expect(201);
    let steps = await storedSteps(draft.versionId);
    expect(steps.map((s) => s.title)).toEqual(['A', 'X', 'B', 'C']);
    expect(steps.map((s) => s.stepOrder)).toEqual([1, 2, 3, 4]);

    const b = steps.find((s) => s.title === 'B')!;
    await http()
      .delete(
        `${versionPath(draft.procedureId, draft.versionId)}/steps/${b.id}`,
      )
      .set(admin)
      .expect(204);
    steps = await storedSteps(draft.versionId);
    expect(steps.map((s) => s.title)).toEqual(['A', 'X', 'C']);
    expect(steps.map((s) => s.stepOrder)).toEqual([1, 2, 3]);

    const byTitle = (title: string) => steps.find((s) => s.title === title)!.id;
    const { body } = await http()
      .put(`${versionPath(draft.procedureId, draft.versionId)}/steps/order`)
      .set(admin)
      .send({ stepIds: [byTitle('C'), byTitle('A'), byTitle('X')] })
      .expect(200);
    expect((body as StepBody[]).map((s) => [s.order, s.title])).toEqual([
      [1, 'C'],
      [2, 'A'],
      [3, 'X'],
    ]);
    steps = await storedSteps(draft.versionId);
    expect(steps.map((s) => [s.stepOrder, s.title])).toEqual([
      [1, 'C'],
      [2, 'A'],
      [3, 'X'],
    ]);
  });

  it('E8: a reorder list with a missing, repeated or foreign step is 400 and the order does not change', async () => {
    const draft = await seedProcedure(t.prisma, {
      versions: [
        { versionNumber: 1, status: 'DRAFT', stepTitles: ['A', 'B', 'C'] },
      ],
    });
    const other = await seedProcedure(t.prisma, {
      versions: [{ versionNumber: 1, status: 'DRAFT', stepTitles: ['Z'] }],
    });
    const [a, b, c] = draft.stepIds[0];
    const url = `${versionPath(draft.procedureId, draft.versionIds[0])}/steps/order`;

    for (const stepIds of [
      [a, c],
      [a, a, b, c],
      [a, b, other.stepIds[0][0]],
    ]) {
      await http().put(url).set(admin).send({ stepIds }).expect(400);
    }

    expect(
      (await storedSteps(draft.versionIds[0])).map((s) => s.title),
    ).toEqual(['A', 'B', 'C']);
  });

  it('E9: an ADMIN edits the title of a draft and it is stored', async () => {
    const draft = await createViaApi('Cierre');

    const { body } = await http()
      .patch(versionPath(draft.procedureId, draft.versionId))
      .set(admin)
      .send({ title: 'Cierre de caja' })
      .expect(200);

    expect((body as VersionBody).title).toBe('Cierre de caja');
    const stored = await t.prisma.procedureVersion.findUniqueOrThrow({
      where: { id: draft.versionId },
    });
    expect(stored.title).toBe('Cierre de caja');
  });

  it('E10: a second draft while one is open is 409 DRAFT_ALREADY_EXISTS', async () => {
    const draft = await createViaApi();

    const { body } = await http()
      .post(`/api/procedures/${draft.procedureId}/versions`)
      .set(admin)
      .expect(409);

    expect(body.reason).toBe('DRAFT_ALREADY_EXISTS');
    expect(
      await t.prisma.procedureVersion.count({
        where: { procedureId: draft.procedureId },
      }),
    ).toBe(1);
  });

  it('E11: a new draft copies the published version with new step ids and leaves it untouched', async () => {
    const seeded = await seedProcedure(t.prisma, {
      versions: [
        { versionNumber: 1, status: 'PUBLISHED', stepTitles: ['A', 'B', 'C'] },
      ],
    });

    const { body } = await http()
      .post(`/api/procedures/${seeded.procedureId}/versions`)
      .set(admin)
      .expect(201);

    const draft = body as VersionBody;
    expect(draft).toMatchObject({
      versionNumber: 2,
      status: 'DRAFT',
      stepCount: 3,
    });
    const copied = await storedSteps(draft.id);
    expect(copied.map((s) => s.title)).toEqual(['A', 'B', 'C']);
    expect(copied.map((s) => s.id)).not.toEqual(
      expect.arrayContaining(seeded.stepIds[0]),
    );
    const published = await storedSteps(seeded.versionIds[0]);
    expect(published.map((s) => s.id)).toEqual(seeded.stepIds[0]);
    const v1 = await t.prisma.procedureVersion.findUniqueOrThrow({
      where: { id: seeded.versionIds[0] },
    });
    expect(v1.status).toBe('PUBLISHED');
  });

  it('E12, E15: a PUBLISHED or SUPERSEDED version rejects every change with 409 VERSION_NOT_EDITABLE and stays the same', async () => {
    const seeded = await seedProcedure(t.prisma, {
      versions: [
        { versionNumber: 1, status: 'SUPERSEDED', stepTitles: ['A', 'B'] },
        { versionNumber: 2, status: 'PUBLISHED', stepTitles: ['C', 'D'] },
      ],
    });

    for (const v of [0, 1]) {
      const url = versionPath(seeded.procedureId, seeded.versionIds[v]);
      const [first, second] = seeded.stepIds[v];
      // Each request is built when it is sent: supertest closes its server after the last
      // pending request, so requests built up front and awaited one by one find it closed.
      const requests = [
        () => http().patch(url).set(admin).send({ title: 'Otro' }),
        () => http().post(`${url}/steps`).set(admin).send({ title: 'Nuevo' }),
        () => http().delete(`${url}/steps/${first}`).set(admin),
        () =>
          http()
            .put(`${url}/steps/order`)
            .set(admin)
            .send({ stepIds: [second, first] }),
        () => http().delete(url).set(admin),
      ];
      for (const send of requests) {
        const { body } = await send().expect(409);
        expect(body.reason).toBe('VERSION_NOT_EDITABLE');
      }
    }

    for (const v of [0, 1]) {
      const stored = await storedSteps(seeded.versionIds[v]);
      expect(stored.map((s) => s.id)).toEqual(seeded.stepIds[v]);
    }
    expect(
      await t.prisma.procedureVersion.count({
        where: { procedureId: seeded.procedureId, title: 'Otro' },
      }),
    ).toBe(0);
  });

  it('E13: deleting the only draft of a new procedure is 204', async () => {
    const draft = await createViaApi();

    await http()
      .delete(versionPath(draft.procedureId, draft.versionId))
      .set(admin)
      .expect(204);

    expect(
      await t.prisma.procedureVersion.count({
        where: { id: draft.versionId },
      }),
    ).toBe(0);
  });

  it('E14: deleting the draft of a published procedure leaves version 1 PUBLISHED with its steps', async () => {
    const seeded = await seedProcedure(t.prisma, {
      versions: [
        { versionNumber: 1, status: 'PUBLISHED', stepTitles: ['A', 'B', 'C'] },
        { versionNumber: 2, status: 'DRAFT', stepTitles: ['A', 'B', 'C'] },
      ],
    });

    await http()
      .delete(versionPath(seeded.procedureId, seeded.versionIds[1]))
      .set(admin)
      .expect(204);

    const v1 = await t.prisma.procedureVersion.findUniqueOrThrow({
      where: { id: seeded.versionIds[0] },
    });
    expect(v1.status).toBe('PUBLISHED');
    expect((await storedSteps(seeded.versionIds[0])).map((s) => s.id)).toEqual(
      seeded.stepIds[0],
    );
    expect(await storedSteps(seeded.versionIds[1])).toHaveLength(0);
  });

  it('E16: two simultaneous requests for a new draft leave a single DRAFT', async () => {
    const seeded = await seedProcedure(t.prisma, {
      versions: [{ versionNumber: 1, status: 'PUBLISHED', stepTitles: ['A'] }],
    });
    const url = `/api/procedures/${seeded.procedureId}/versions`;

    const responses = await Promise.all([
      http().post(url).set(admin),
      http().post(url).set(admin),
    ]);

    expect(responses.map((r) => r.status)).toEqual(
      expect.arrayContaining([201, 409]),
    );
    expect(
      await t.prisma.procedureVersion.count({
        where: { procedureId: seeded.procedureId, status: 'DRAFT' },
      }),
    ).toBe(1);
  });

  it('404: a missing procedure and a version of another procedure answer the same message', async () => {
    const mine = await seedProcedure(t.prisma, {
      versions: [{ versionNumber: 1, status: 'DRAFT' }],
    });
    const other = await seedProcedure(t.prisma, {
      versions: [{ versionNumber: 1, status: 'DRAFT' }],
    });

    const missing = await http()
      .patch(versionPath(randomUUID(), mine.versionIds[0]))
      .set(admin)
      .send({ title: 'Otro' })
      .expect(404);
    const foreignVersion = await http()
      .patch(versionPath(mine.procedureId, other.versionIds[0]))
      .set(admin)
      .send({ title: 'Otro' })
      .expect(404);

    expect(missing.body.message).toBe(NOT_FOUND_PROCEDURE);
    expect(foreignVersion.body.message).toBe(NOT_FOUND_PROCEDURE);
    const untouched = await t.prisma.procedureVersion.findUniqueOrThrow({
      where: { id: other.versionIds[0] },
    });
    expect(untouched.title).toBe('Cierre de caja');
  });
});
