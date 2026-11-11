/* Assistant metrics end to end over HTTP (HU38): real SQL over the chat tables, small
talk left out, latency percentiles, tokens, feedback, and access by role and area */

import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AREA_IDS, FIXTURE_USERS } from '../../src/documents/adapters/fixtures';
import {
  ExecutionsTestApp,
  authHeaders,
  closeExecutionsTestApp,
  createExecutionsTestApp,
} from './helpers';

type Status = 'ANSWERED' | 'NO_INFO' | 'CONFLICT' | 'AI_UNAVAILABLE';

interface Question {
  status: Status;
  at: string; // ISO instant
  latencyMs: number;
  model?: boolean; // the model was called (default true, but not for AI_UNAVAILABLE)
  chunks?: number; // used chunks (default 1 for ANSWERED and CONFLICT)
  inputTokens?: number;
  outputTokens?: number;
  useful?: boolean; // feedback, if any
}

// Only questions of 2031, so rows other suites leave (asked now) never fall in the period.
const PERIOD = '?from=2031-03-01&to=2031-03-31';
// The 1st of March of 2031 at noon in Buenos Aires.
const IN_PERIOD = '2031-03-01T15:00:00.000Z';

// A person in Ventas and Operaciones, only of this suite.
const BOTH_AREAS = {
  id: randomUUID(),
  role: 'EMPLOYEE' as const,
};

describe('GET /api/metrics/assistant (e2e)', () => {
  let t: ExecutionsTestApp;
  const conversations: string[] = [];

  const admin = authHeaders(FIXTURE_USERS.admin);
  const supervisorVentas = authHeaders(FIXTURE_USERS.supervisorVentas);
  const supervisorOperaciones = authHeaders(
    FIXTURE_USERS.supervisorOperaciones,
  );
  const elena = authHeaders(FIXTURE_USERS.empleadoVentas);

  const get = (headers: Record<string, string>, query = PERIOD) =>
    request(t.app.getHttpServer())
      .get(`/api/metrics/assistant${query}`)
      .set(headers);

  // One conversation of userId with its questions, written as the chat writes them.
  async function ask(userId: string, questions: Question[]): Promise<void> {
    const conversation = await t.prisma.conversation.create({
      data: { userId, title: 'Métricas del asistente (e2e)' },
    });
    conversations.push(conversation.id);
    for (const q of questions) {
      const model = q.model ?? q.status !== 'AI_UNAVAILABLE';
      const chunks =
        q.chunks ??
        (q.status === 'ANSWERED' || q.status === 'CONFLICT' ? 1 : 0);
      const message = await t.prisma.message.create({
        data: {
          conversationId: conversation.id,
          question: '¿Pregunta?',
          answer: 'Respuesta',
          status: q.status,
          usedChunkIds: Array.from({ length: chunks }, () => randomUUID()),
          usedVersionIds: [],
          modelName: model ? 'gemini-2.5-flash' : null,
          latencyMs: q.latencyMs,
          inputTokens: q.inputTokens ?? null,
          outputTokens: q.outputTokens ?? null,
          createdAt: new Date(q.at),
        },
      });
      if (q.useful !== undefined) {
        await t.prisma.messageFeedback.create({
          data: { messageId: message.id, userId, useful: q.useful },
        });
      }
    }
  }

  // Elena (Ventas): one of each result and a greeting; Emilio (Operaciones) and the
  // ADMIN one answered each; and one of Elena outside the period.
  async function seedEveryone(): Promise<void> {
    await ask(FIXTURE_USERS.empleadoVentas.id, [
      {
        status: 'ANSWERED',
        at: IN_PERIOD,
        latencyMs: 1000,
        inputTokens: 100,
        outputTokens: 20,
        useful: true,
      },
      {
        status: 'NO_INFO',
        at: IN_PERIOD,
        latencyMs: 3000,
        inputTokens: 50,
        outputTokens: 5,
      },
      {
        status: 'CONFLICT',
        at: IN_PERIOD,
        latencyMs: 2000,
        inputTokens: 80,
        outputTokens: 10,
        useful: false,
      },
      { status: 'AI_UNAVAILABLE', at: IN_PERIOD, latencyMs: 9000 },
      // A greeting: answered without the model and without chunks.
      {
        status: 'ANSWERED',
        at: IN_PERIOD,
        latencyMs: 5,
        model: false,
        chunks: 0,
        useful: true,
      },
      // The day after the period (Buenos Aires).
      {
        status: 'ANSWERED',
        at: '2031-04-01T03:00:00.000Z',
        latencyMs: 100,
        inputTokens: 999,
        outputTokens: 999,
      },
    ]);
    await ask(FIXTURE_USERS.empleadoOperaciones.id, [
      {
        status: 'ANSWERED',
        at: IN_PERIOD,
        latencyMs: 4000,
        inputTokens: 10,
        outputTokens: 2,
      },
    ]);
    await ask(FIXTURE_USERS.admin.id, [
      {
        status: 'ANSWERED',
        at: IN_PERIOD,
        latencyMs: 6000,
        inputTokens: 1,
        outputTokens: 1,
      },
    ]);
  }

  beforeAll(async () => {
    t = await createExecutionsTestApp();
    await t.prisma.user.create({
      data: {
        id: BOTH_AREAS.id,
        name: 'Persona de dos áreas',
        email: `dos-areas-${BOTH_AREAS.id}@executions.test`,
        passwordHash: '!fixture-sin-contraseña', // not a bcrypt hash: cannot log in
        role: BOTH_AREAS.role,
        areas: {
          createMany: {
            data: [
              { areaId: AREA_IDS.ventas },
              { areaId: AREA_IDS.operaciones },
            ],
          },
        },
      },
    });
  });

  afterEach(async () => {
    // Messages and their feedback go with the conversation (ON DELETE CASCADE).
    await t.prisma.conversation.deleteMany({
      where: { id: { in: conversations.splice(0) } },
    });
  });

  afterAll(async () => {
    await t.prisma.userArea.deleteMany({ where: { userId: BOTH_AREAS.id } });
    await t.prisma.user.deleteMany({ where: { id: BOTH_AREAS.id } });
    await closeExecutionsTestApp(t);
  });

  it('ADMIN without an area: every question once, small talk apart, in the period', async () => {
    await seedEveryone();

    const response = await get(admin).expect(200);

    expect(response.body).toEqual({
      filters: { areaId: null, from: '2031-03-01', to: '2031-03-31' },
      totals: {
        questions: 6,
        answered: 3,
        noInfo: 1,
        conflict: 1,
        aiUnavailable: 1,
        smallTalk: 1,
        // 1000, 2000, 3000, 4000 and 6000: neither the greeting nor AI_UNAVAILABLE.
        latencyP50Ms: 3000,
        latencyP95Ms: 5600,
        inputTokens: 241,
        outputTokens: 38,
        // The useful of the greeting does not count.
        feedback: { useful: 1, notUseful: 1 },
      },
    });
  });

  it('ADMIN with Ventas: only the people of Ventas, never the ADMIN', async () => {
    await seedEveryone();

    const response = await get(
      admin,
      `${PERIOD}&areaId=${AREA_IDS.ventas}`,
    ).expect(200);

    expect(response.body.totals).toEqual({
      questions: 4,
      answered: 1,
      noInfo: 1,
      conflict: 1,
      aiUnavailable: 1,
      smallTalk: 1,
      latencyP50Ms: 2000,
      latencyP95Ms: 2900,
      inputTokens: 230,
      outputTokens: 35,
      feedback: { useful: 1, notUseful: 1 },
    });
  });

  it('a SUPERVISOR sees the people of their areas; another area is a 404', async () => {
    await seedEveryone();

    const ventas = await get(supervisorVentas).expect(200);
    expect(ventas.body.totals.questions).toBe(4);

    const operaciones = await get(supervisorOperaciones).expect(200);
    expect(operaciones.body.totals).toMatchObject({
      questions: 1,
      answered: 1,
      smallTalk: 0,
      inputTokens: 10,
    });

    await get(
      supervisorVentas,
      `${PERIOD}&areaId=${AREA_IDS.operaciones}`,
    ).expect(404);
  });

  it('EMPLOYEE: 403', async () => {
    await get(elena).expect(403);
  });

  it('a person in two areas counts once without a filter, and in each area', async () => {
    await ask(BOTH_AREAS.id, [
      {
        status: 'ANSWERED',
        at: IN_PERIOD,
        latencyMs: 1500,
        inputTokens: 7,
        outputTokens: 3,
      },
    ]);

    const all = await get(admin).expect(200);
    const ventas = await get(
      admin,
      `${PERIOD}&areaId=${AREA_IDS.ventas}`,
    ).expect(200);
    const operaciones = await get(
      admin,
      `${PERIOD}&areaId=${AREA_IDS.operaciones}`,
    ).expect(200);

    expect(all.body.totals.questions).toBe(1);
    expect(all.body.totals.inputTokens).toBe(7);
    expect(ventas.body.totals.questions).toBe(1);
    expect(operaciones.body.totals.questions).toBe(1);
  });

  it('nothing in the period: zeros and the latencies null', async () => {
    await seedEveryone();

    const response = await get(admin, '?from=2031-05-01&to=2031-05-02').expect(
      200,
    );

    expect(response.body.totals).toEqual({
      questions: 0,
      answered: 0,
      noInfo: 0,
      conflict: 0,
      aiUnavailable: 0,
      smallTalk: 0,
      latencyP50Ms: null,
      latencyP95Ms: null,
      inputTokens: 0,
      outputTokens: 0,
      feedback: { useful: 0, notUseful: 0 },
    });
  });

  it('only small talk: it is counted, but no question and no latency', async () => {
    await ask(FIXTURE_USERS.empleadoVentas.id, [
      {
        status: 'ANSWERED',
        at: IN_PERIOD,
        latencyMs: 3,
        model: false,
        chunks: 0,
      },
    ]);

    const response = await get(admin).expect(200);

    expect(response.body.totals).toMatchObject({
      questions: 0,
      smallTalk: 1,
      latencyP50Ms: null,
      latencyP95Ms: null,
    });
  });
});
