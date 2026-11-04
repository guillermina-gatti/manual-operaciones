/* Spec 010 (T08): el contexto del paso de punta a punta, con la base de tests. El modelo y los
embeddings son simulados; la validación del contexto, la visibilidad, la conversación y las dos rutas
son las reales. */

import request from 'supertest';
import { ChatLlm } from '../../src/chat/ports/chat-llm';
import { FakeLlm } from '../../src/chat/testing/chat-fakes';
import { AREA_IDS, FIXTURE_USERS } from '../../src/documents/adapters/fixtures';
import { EmbeddingProvider } from '../../src/processing/ports/embedding-provider';
import {
  DocumentsTestApp,
  authHeaders,
  cleanDocuments,
  createDocumentsTestApp,
  seedDocument,
  seedProcessedVersion,
} from '../documents/helpers';
import {
  FixedEmbeddings,
  VECTOR,
  asText,
  deleteProcedures,
  parseEvents,
  seedExecution,
  seedProcedure,
  type SeededProcedure,
} from './helpers';

const STEPS = [
  { title: 'Abrir la caja' },
  { title: 'Contar el efectivo', description: 'Contá billetes y monedas.' },
];

describe('El contexto del paso (integración, spec 010)', () => {
  let t: DocumentsTestApp;
  const llm = new FakeLlm(['Contá dos veces ', '[S1].']);
  const created: string[] = [];

  const empleado = authHeaders(FIXTURE_USERS.empleadoVentas);
  const supervisor = authHeaders(FIXTURE_USERS.supervisorVentas);
  const admin = authHeaders(FIXTURE_USERS.admin);
  const http = () => request(t.app.getHttpServer());

  const stream = (body: object, headers: object = empleado) =>
    http()
      .post('/api/chat/stream')
      .set(headers as Record<string, string>)
      .send(body)
      .buffer(true)
      .parse(asText as never); // supertest tipa la respuesta de superagent, que no es dependencia directa
  const post = (body: object, headers: object = empleado) =>
    http()
      .post('/api/chat')
      .set(headers as Record<string, string>)
      .send(body);

  const seed = async (...args: Parameters<typeof seedProcedure>) => {
    const procedure = await seedProcedure(...args);
    created.push(procedure.procedureId);
    return procedure;
  };
  const contextOf = (p: SeededProcedure, version: number, step = 1) => ({
    procedureVersionId: p.versions[version].id,
    stepId: p.versions[version].stepIds[step],
  });
  const conversationsCount = () =>
    t.prisma.conversation.count({
      where: { userId: FIXTURE_USERS.empleadoVentas.id },
    });

  beforeAll(async () => {
    t = await createDocumentsTestApp({
      configure: (builder) =>
        builder
          .overrideProvider(ChatLlm)
          .useValue(llm)
          .overrideProvider(EmbeddingProvider)
          .useValue(new FixedEmbeddings()),
    });
  });

  afterAll(async () => {
    await deleteProcedures(t.prisma, created);
    await t.prisma.conversation.deleteMany({
      where: {
        userId: { in: Object.values(FIXTURE_USERS).map((u) => u.id) },
      },
    });
    await cleanDocuments(t.prisma);
    await t.app.close();
  });

  beforeEach(async () => {
    await cleanDocuments(t.prisma);
    const doc = await seedDocument(t.prisma, {
      areaIds: [AREA_IDS.ventas],
      title: 'Manual de caja',
    });
    await seedProcessedVersion(t.prisma, {
      documentId: doc.id,
      versionId: doc.versionId,
      areaIds: [AREA_IDS.ventas],
      contents: ['Contar el efectivo dos veces antes de cerrar.'],
    });
    await t.prisma.$executeRawUnsafe(
      `UPDATE chunks SET embedding = $1::vector WHERE document_id = $2::uuid`,
      `[${VECTOR.join(',')}]`,
      doc.id,
    );
  });

  it('E7: un context mal formado es 400 en JSON, en las dos rutas', async () => {
    const bad = { message: 'hola', context: { procedureVersionId: 'abc' } };

    const viaStream = await http()
      .post('/api/chat/stream')
      .set(empleado)
      .send(bad);
    const viaPost = await post(bad);

    for (const res of [viaStream, viaPost]) {
      expect(res.status).toBe(400);
      expect(res.headers['content-type']).toMatch(/application\/json/);
    }
  });

  it('E1, E4: con un paso de la vigente transmite y la conversación queda con el paso', async () => {
    const p = await seed(t.prisma, {
      areaIds: [AREA_IDS.ventas],
      versions: [{ versionNumber: 1, status: 'PUBLISHED', steps: STEPS }],
    });
    const context = contextOf(p, 1);

    const res = await stream({ message: '¿Qué hago acá?', context });

    expect(res.status).toBe(200);
    const events = parseEvents(res.body as string);
    expect(events.at(-1)!.event).toBe('done');
    const conversationId = events[0].data.conversationId as string;
    const saved = await t.prisma.conversation.findUniqueOrThrow({
      where: { id: conversationId },
    });
    expect(saved).toMatchObject({
      procedureVersionId: context.procedureVersionId,
      stepId: context.stepId,
    });
  });

  it('E8: un paso de otra versión es 404, sin crear la conversación', async () => {
    const p = await seed(t.prisma, {
      areaIds: [AREA_IDS.ventas],
      versions: [
        { versionNumber: 1, status: 'SUPERSEDED', steps: STEPS },
        { versionNumber: 2, status: 'PUBLISHED', steps: STEPS },
      ],
    });
    const before = await conversationsCount();

    const res = await http()
      .post('/api/chat/stream')
      .set(empleado)
      .send({
        message: 'hola',
        context: {
          procedureVersionId: p.versions[2].id,
          stepId: p.versions[1].stepIds[1],
        },
      });

    expect(res.status).toBe(404);
    expect((res.body as { message: string }).message).toBe(
      'El paso no está disponible',
    );
    expect(await conversationsCount()).toBe(before);
  });

  it('E9: un procedimiento de otra área es 404', async () => {
    const p = await seed(t.prisma, {
      areaIds: [AREA_IDS.operaciones],
      versions: [{ versionNumber: 1, status: 'PUBLISHED', steps: STEPS }],
    });

    const res = await http()
      .post('/api/chat/stream')
      .set(empleado)
      .send({ message: 'hola', context: contextOf(p, 1) });

    expect(res.status).toBe(404);
  });

  it('E10: una versión reemplazada vale con una ejecución en curso propia; sin ella, 404', async () => {
    const p = await seed(t.prisma, {
      areaIds: [AREA_IDS.ventas],
      versions: [
        { versionNumber: 1, status: 'SUPERSEDED', steps: STEPS },
        { versionNumber: 2, status: 'PUBLISHED', steps: STEPS },
      ],
    });
    await seedExecution(t.prisma, {
      userId: FIXTURE_USERS.empleadoVentas.id,
      procedureId: p.procedureId,
      procedureVersionId: p.versions[1].id,
    });
    const context = contextOf(p, 1);

    const owner = await stream({ message: 'hola', context });
    const other = await http()
      .post('/api/chat/stream')
      .set(supervisor)
      .send({ message: 'hola', context });

    expect(owner.status).toBe(200);
    expect(other.status).toBe(404);
  });

  it('E11: el ADMIN puede con un paso de un DRAFT', async () => {
    const p = await seed(t.prisma, {
      areaIds: [AREA_IDS.operaciones],
      versions: [{ versionNumber: 1, status: 'DRAFT', steps: STEPS }],
    });

    const res = await stream(
      { message: 'hola', context: contextOf(p, 1) },
      admin,
    );

    expect(res.status).toBe(200);
  });

  it('E12: seguir una conversación con otro paso, o sin paso, es 400', async () => {
    const p = await seed(t.prisma, {
      areaIds: [AREA_IDS.ventas],
      versions: [{ versionNumber: 1, status: 'PUBLISHED', steps: STEPS }],
    });
    const first = parseEvents(
      (await stream({ message: 'hola', context: contextOf(p, 1, 1) }))
        .body as string,
    );
    const conversationId = first[0].data.conversationId as string;

    const otherStep = await http()
      .post('/api/chat/stream')
      .set(empleado)
      .send({ message: 'sigo', conversationId, context: contextOf(p, 1, 0) });
    const noStep = await post({ message: 'sigo', conversationId });

    for (const res of [otherStep, noStep]) {
      expect(res.status).toBe(400);
      expect((res.body as { message: string }).message).toBe(
        'La conversación es de otro paso',
      );
    }
  });

  it('E6: con el mismo contexto, POST /api/chat y /stream responden lo mismo', async () => {
    const p = await seed(t.prisma, {
      areaIds: [AREA_IDS.ventas],
      versions: [{ versionNumber: 1, status: 'PUBLISHED', steps: STEPS }],
    });
    const context = contextOf(p, 1);

    const viaPost = await post({ message: '¿Qué hago acá?', context });
    const viaStream = parseEvents(
      (await stream({ message: '¿Qué hago acá?', context })).body as string,
    ).at(-1)!.data;

    expect(viaPost.status).toBe(200);
    const body = viaPost.body as Record<string, unknown>;
    expect(viaStream.status).toBe(body.status);
    expect(viaStream.answer).toBe(body.answer);
    expect(viaStream.sources).toEqual(body.sources);
  });
});
