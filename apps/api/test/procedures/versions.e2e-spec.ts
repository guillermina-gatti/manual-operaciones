/* Publish, immutability, new version, history and detail end to end over HTTP against the test database
(spec 015, Parte 1: E1 to E9, E15 to E18) */

import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AREA_IDS, FIXTURE_USERS } from '../../src/documents/adapters/fixtures';
import { ProceduresTestApp, authHeaders, createProceduresTestApp } from './app-helpers';
import { cleanProcedures, seedProcedure } from './helpers';

interface VersionBody {
  id: string;
  versionNumber: number;
  status: 'DRAFT' | 'PUBLISHED' | 'SUPERSEDED';
  isCritical: boolean;
  changeSummary: string | null;
  publishedAt: string | null;
  publishedBy: { id: string; name: string | null } | null;
  steps?: { id: string; order: number; title: string }[];
}

const NOT_FOUND = 'No se encontró el procedimiento';

describe('Procedures: versions (integration)', () => {
  let t: ProceduresTestApp;
  const admin = authHeaders(FIXTURE_USERS.admin);
  const supervisor = authHeaders(FIXTURE_USERS.supervisorVentas);
  const employee = authHeaders(FIXTURE_USERS.empleadoVentas);
  const http = () => request(t.app.getHttpServer());

  const versionsPath = (procedureId: string) => `/api/procedures/${procedureId}/versions`;
  const publishPath = (procedureId: string, versionId: string) =>
    `${versionsPath(procedureId)}/${versionId}/publish`;
  const statuses = (procedureId: string) =>
    t.prisma.procedureVersion.findMany({
      where: { procedureId },
      orderBy: { versionNumber: 'asc' },
      select: { versionNumber: true, status: true },
    });
  const storedSteps = (versionId: string) =>
    t.prisma.step.findMany({
      where: { procedureVersionId: versionId },
      orderBy: { stepOrder: 'asc' },
    });

  // Version 1 PUBLISHED with two steps and the draft 2 with one, in Ventas.
  const withDraft = () =>
    seedProcedure(t.prisma, {
      areaIds: [AREA_IDS.ventas],
      versions: [
        { versionNumber: 1, status: 'PUBLISHED', stepTitles: ['Contar', 'Comparar'] },
        { versionNumber: 2, status: 'DRAFT', stepTitles: ['Contar y firmar'] },
      ],
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

  describe('publish', () => {
    it('E1 and E2: publishes the draft, says who and when, and the previous one becomes SUPERSEDED', async () => {
      const { procedureId, versionIds } = await withDraft();

      const { body } = await http().post(publishPath(procedureId, versionIds[1])).set(admin).expect(200);

      const published = body as VersionBody;
      expect(published).toMatchObject({ versionNumber: 2, status: 'PUBLISHED' });
      expect(published.publishedBy?.id).toBe(FIXTURE_USERS.admin.id);
      expect(Date.parse(published.publishedAt ?? '')).not.toBeNaN();
      expect(await statuses(procedureId)).toEqual([
        { versionNumber: 1, status: 'SUPERSEDED' },
        { versionNumber: 2, status: 'PUBLISHED' },
      ]);
    });

    it('E3: a draft without steps is 409 NO_STEPS and stays a draft', async () => {
      const { procedureId, versionIds } = await seedProcedure(t.prisma, {
        areaIds: [AREA_IDS.ventas],
        versions: [{ versionNumber: 1, status: 'DRAFT' }],
      });

      const { body } = await http().post(publishPath(procedureId, versionIds[0])).set(admin).expect(409);

      expect(body).toMatchObject({ reason: 'NO_STEPS' });
      expect(await statuses(procedureId)).toEqual([{ versionNumber: 1, status: 'DRAFT' }]);
    });

    it('E4: a procedure without areas is 409 NO_AREAS and stays a draft', async () => {
      const { procedureId, versionIds } = await seedProcedure(t.prisma, {
        versions: [{ versionNumber: 1, status: 'DRAFT', stepTitles: ['Contar'] }],
      });

      const { body } = await http().post(publishPath(procedureId, versionIds[0])).set(admin).expect(409);

      expect(body).toMatchObject({ reason: 'NO_AREAS' });
      expect(await statuses(procedureId)).toEqual([{ versionNumber: 1, status: 'DRAFT' }]);
    });

    it('E5: a version that is not a draft is 409 VERSION_NOT_DRAFT and nothing changes', async () => {
      const { procedureId, versionIds } = await withDraft();

      const { body } = await http().post(publishPath(procedureId, versionIds[0])).set(admin).expect(409);

      expect(body).toMatchObject({ reason: 'VERSION_NOT_DRAFT' });
      expect(await statuses(procedureId)).toEqual([
        { versionNumber: 1, status: 'PUBLISHED' },
        { versionNumber: 2, status: 'DRAFT' },
      ]);
    });

    it('E10: a critical change is saved with its summary and the history shows it', async () => {
      const { procedureId, versionIds } = await withDraft();

      await http()
        .post(publishPath(procedureId, versionIds[1]))
        .set(admin)
        .send({ isCritical: true, changeSummary: 'Cambia el límite de caja' })
        .expect(200);
      const { body } = await http().get(versionsPath(procedureId)).set(admin).expect(200);

      const [newest, oldest] = (body as { data: VersionBody[] }).data;
      expect(newest).toMatchObject({ versionNumber: 2, isCritical: true, changeSummary: 'Cambia el límite de caja' });
      expect(oldest).toMatchObject({ versionNumber: 1, isCritical: false, changeSummary: null });
    });

    it.each([
      ['no summary', { isCritical: true }],
      ['a summary of only spaces', { isCritical: true, changeSummary: '   ' }],
      ['a summary of 301 characters', { isCritical: true, changeSummary: 'a'.repeat(301) }],
    ])('E11: a critical change with %s is 400, naming the field, and stays a draft', async (_case, payload) => {
      const { procedureId, versionIds } = await withDraft();

      const { body } = await http().post(publishPath(procedureId, versionIds[1])).set(admin).send(payload).expect(400);

      expect(JSON.stringify(body)).toContain('changeSummary');
      expect((await statuses(procedureId))[1].status).toBe('DRAFT');
    });

    it('E18: two publications at the same time: one wins, the other is 409, and there is one PUBLISHED', async () => {
      const { procedureId, versionIds } = await withDraft();

      const results = await Promise.all([
        http().post(publishPath(procedureId, versionIds[1])).set(admin),
        http().post(publishPath(procedureId, versionIds[1])).set(admin),
      ]);

      expect(results.map((result) => result.status).sort((a, b) => a - b)).toEqual([200, 409]);
      const published = (await statuses(procedureId)).filter((v) => v.status === 'PUBLISHED');
      expect(published).toHaveLength(1);
    });
  });

  describe('immutability and new version', () => {
    it('E6: a PUBLISHED version cannot be edited, and keeps its title and its steps', async () => {
      const { procedureId, versionIds, stepIds } = await withDraft();
      const path = `${versionsPath(procedureId)}/${versionIds[0]}`;

      await http().patch(path).set(admin).send({ title: 'Otro título' }).expect(409);
      await http().post(`${path}/steps`).set(admin).send({ title: 'Nuevo' }).expect(409);
      await http().delete(`${path}/steps/${stepIds[0][0]}`).set(admin).expect(409);

      const steps = await storedSteps(versionIds[0]);
      expect(steps.map((step) => step.id)).toEqual(stepIds[0]);
      expect(steps.map((step) => step.title)).toEqual(['Contar', 'Comparar']);
      const version = await t.prisma.procedureVersion.findUniqueOrThrow({ where: { id: versionIds[0] } });
      expect(version.title).toBe('Cierre de caja');
    });

    it('E7: a new version copies the steps (new ids, same step keys) and editing it does not touch the PUBLISHED one', async () => {
      const { procedureId, versionIds } = await seedProcedure(t.prisma, {
        areaIds: [AREA_IDS.ventas],
        versions: [{ versionNumber: 1, status: 'PUBLISHED', stepTitles: ['Contar', 'Comparar'] }],
      });

      const { body } = await http().post(versionsPath(procedureId)).set(admin).expect(201);
      const draft = body as { id: string; versionNumber: number; status: string };
      await http().post(`${versionsPath(procedureId)}/${draft.id}/steps`).set(admin).send({ title: 'Cerrar' }).expect(201);

      expect(draft).toMatchObject({ versionNumber: 2, status: 'DRAFT' });
      const original = await storedSteps(versionIds[0]);
      const copy = await storedSteps(draft.id);
      expect(original).toHaveLength(2);
      expect(copy).toHaveLength(3);
      expect(copy.slice(0, 2).map((step) => step.stepKey)).toEqual(original.map((step) => step.stepKey));
      expect(copy.slice(0, 2).map((step) => step.id)).not.toEqual(original.map((step) => step.id));
    });
  });

  describe('history and detail', () => {
    it('E8: the history is newest first, with the format of the page and who published each version', async () => {
      const { procedureId } = await withDraft();

      const { body } = await http().get(versionsPath(procedureId)).set(admin).expect(200);

      expect(body).toMatchObject({ total: 2, page: 1, limit: 20 });
      expect((body as { data: VersionBody[] }).data.map((v) => v.versionNumber)).toEqual([2, 1]);
      expect((body as { data: VersionBody[] }).data[1].status).toBe('PUBLISHED');
    });

    it('E9: the detail gives a version with its steps in order, in any state', async () => {
      const { procedureId, versionIds } = await withDraft();

      const { body } = await http().get(`${versionsPath(procedureId)}/${versionIds[0]}`).set(admin).expect(200);

      expect((body as VersionBody).steps?.map((step) => step.title)).toEqual(['Contar', 'Comparar']);
    });
  });

  describe('errors', () => {
    it('E15: 403 for a SUPERVISOR and an EMPLOYEE, and 401 without a session', async () => {
      const { procedureId, versionIds } = await withDraft();
      const urls = [
        ['post', publishPath(procedureId, versionIds[1])],
        ['get', versionsPath(procedureId)],
        ['get', `${versionsPath(procedureId)}/${versionIds[0]}`],
      ] as const;

      for (const [method, url] of urls) {
        await http()[method](url).set(supervisor).expect(403);
        await http()[method](url).set(employee).expect(403);
        await http()[method](url).expect(401);
      }
      expect(await statuses(procedureId)).toEqual([
        { versionNumber: 1, status: 'PUBLISHED' },
        { versionNumber: 2, status: 'DRAFT' },
      ]);
    });

    it('E16: a missing procedure and a version of another procedure give the same 404', async () => {
      const mine = await withDraft();
      const other = await withDraft();

      const missing = await http().post(publishPath(randomUUID(), mine.versionIds[1])).set(admin).expect(404);
      const foreign = await http().post(publishPath(mine.procedureId, other.versionIds[1])).set(admin).expect(404);
      const detail = await http().get(`${versionsPath(mine.procedureId)}/${other.versionIds[0]}`).set(admin).expect(404);

      expect((missing.body as { message: string }).message).toBe(NOT_FOUND);
      expect(foreign.body).toEqual(missing.body);
      expect(detail.body).toEqual(missing.body);
      expect(await statuses(other.procedureId)).toEqual([
        { versionNumber: 1, status: 'PUBLISHED' },
        { versionNumber: 2, status: 'DRAFT' },
      ]);
    });

    it('E17: an id that is not a UUID, a body that is not valid and a limit of 101 are 400', async () => {
      const { procedureId, versionIds } = await withDraft();

      await http().post(publishPath('xyz', versionIds[1])).set(admin).expect(400);
      await http().post(publishPath(procedureId, versionIds[1])).set(admin).send({ isCritical: 'yes' }).expect(400);
      await http().post(publishPath(procedureId, versionIds[1])).set(admin).send({ other: 1 }).expect(400);
      await http().get(`${versionsPath(procedureId)}?limit=101`).set(admin).expect(400);

      expect((await statuses(procedureId))[1].status).toBe('DRAFT');
    });
  });
});
