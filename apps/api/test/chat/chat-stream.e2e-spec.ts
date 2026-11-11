/* Spec 009 (T09): POST /api/chat/stream de punta a punta, con la base de tests. El modelo y los
embeddings son simulados (ningún test llama a Gemini); la recuperación, el guardado, el guard y la
validación son los reales. */

import type { IncomingMessage } from 'node:http';
import request from 'supertest';
import { EmbeddingProvider } from '../../src/processing/ports/embedding-provider';
import { ChatLlm } from '../../src/chat/ports/chat-llm';
import { FakeLlm } from '../../src/chat/testing/chat-fakes';
import { AREA_IDS, FIXTURE_USERS } from '../../src/documents/adapters/fixtures';
import {
  DocumentsTestApp,
  authHeaders,
  cleanDocuments,
  createDocumentsTestApp,
  seedDocument,
  seedProcessedVersion,
} from '../documents/helpers';

// Todos los textos tienen el mismo vector: la distancia de la pregunta a cada fragmento es 0.
const VECTOR = Array.from({ length: 768 }, (_, i) => (i % 7) / 10 + 0.01);

class FixedEmbeddings extends EmbeddingProvider {
  async embedMany(texts: string[]): Promise<number[][]> {
    return texts.map(() => [...VECTOR]);
  }
}

interface StreamEvent {
  event: string;
  data: Record<string, unknown>;
}

// Junta el cuerpo SSE como texto (supertest no lo interpreta) y lo separa en eventos.
const asText = (
  res: IncomingMessage,
  done: (err: Error | null, body: string) => void,
) => {
  let body = '';
  res.setEncoding('utf8');
  res.on('data', (chunk: string) => (body += chunk));
  res.on('end', () => done(null, body));
};

function parseEvents(body: string): StreamEvent[] {
  return body
    .split('\n\n')
    .filter((block) => block.trim().length > 0)
    .map((block) => {
      const lines = block.split('\n');
      const event = lines
        .find((l) => l.startsWith('event: '))!
        .slice('event: '.length);
      const data = lines
        .find((l) => l.startsWith('data: '))!
        .slice('data: '.length);
      return { event, data: JSON.parse(data) as Record<string, unknown> };
    });
}

describe('POST /api/chat/stream (integración, spec 009)', () => {
  let t: DocumentsTestApp;
  const llm = new FakeLlm(['El plazo ', 'es de 5 días ', '[S1].']);

  const empleado = authHeaders(FIXTURE_USERS.empleadoVentas);
  const http = () => request(t.app.getHttpServer());

  const stream = (body: object, headers: object = empleado) =>
    http()
      .post('/api/chat/stream')
      .set(headers as Record<string, string>)
      .send(body)
      .buffer(true)
      .parse(asText as never); // supertest tipa la respuesta de superagent, que no es dependencia directa;

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
    await t.prisma.conversation.deleteMany({
      where: { userId: { in: Object.values(FIXTURE_USERS).map((u) => u.id) } },
    });
    await cleanDocuments(t.prisma);
    await t.app.close();
  });

  beforeEach(async () => {
    await cleanDocuments(t.prisma);
    const doc = await seedDocument(t.prisma, {
      areaIds: [AREA_IDS.ventas],
      title: 'Manual de plazos',
    });
    await seedProcessedVersion(t.prisma, {
      documentId: doc.id,
      versionId: doc.versionId,
      areaIds: [AREA_IDS.ventas],
      contents: ['El plazo de entrega es de 5 días hábiles.'],
    });
    await t.prisma.$executeRawUnsafe(
      `UPDATE chunks SET embedding = $1::vector WHERE document_id = $2::uuid`,
      `[${VECTOR.join(',')}]`,
      doc.id,
    );
  });

  it('E4: 200 con los encabezados SSE, y start, los delta y un solo done en orden', async () => {
    const res = await stream({ message: '¿Cuál es el plazo?' });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^text\/event-stream/);
    expect(res.headers['cache-control']).toBe('no-cache, no-transform');
    expect(res.headers['x-accel-buffering']).toBe('no');

    const events = parseEvents(res.body as string);
    expect(events.map((e) => e.event)).toEqual([
      'start',
      'delta',
      'delta',
      'delta',
      'done',
    ]);
    expect(events[0].data.conversationId).toEqual(expect.any(String));

    const done = events.at(-1)!.data;
    expect(done).toMatchObject({
      conversationId: events[0].data.conversationId,
      status: 'answered',
      answer: 'El plazo es de 5 días [S1].',
    });
    expect(
      events
        .filter((e) => e.event === 'delta')
        .map((e) => e.data.text)
        .join(''),
    ).toBe(done.answer);
  });

  it('el mensaje queda guardado con el estado de done', async () => {
    const res = await stream({ message: '¿Cuál es el plazo?' });
    const done = parseEvents(res.body as string).at(-1)!.data;

    const saved = await t.prisma.message.findUniqueOrThrow({
      where: { id: done.messageId as string },
    });
    expect(saved.status).toBe('ANSWERED');
    expect(saved.conversationId).toBe(done.conversationId);
  });

  it('E14: la segunda pregunta con el conversationId de start sigue la misma conversación', async () => {
    const first = parseEvents(
      (await stream({ message: '¿Cuál es el plazo?' })).body as string,
    );
    const conversationId = first[0].data.conversationId as string;

    const second = parseEvents(
      (await stream({ message: '¿Y el de otra cosa?', conversationId }))
        .body as string,
    );

    expect(second[0].data.conversationId).toBe(conversationId);
    expect(await t.prisma.message.count({ where: { conversationId } })).toBe(2);
  });

  it('E13: sin sesión, 401 en JSON', async () => {
    const res = await http().post('/api/chat/stream').send({ message: 'hola' });

    expect(res.status).toBe(401);
    expect(res.headers['content-type']).toMatch(/application\/json/);
  });

  it('E13: con un message vacío, 400 en JSON', async () => {
    const res = await http()
      .post('/api/chat/stream')
      .set(empleado)
      .send({ message: '' });

    expect(res.status).toBe(400);
    expect(res.headers['content-type']).toMatch(/application\/json/);
  });

  it('E13: con la conversación de otro usuario, 404 en JSON sin abrir la transmisión', async () => {
    const ajena = await t.prisma.conversation.create({
      data: { userId: FIXTURE_USERS.supervisorVentas.id, title: 'ajena' },
    });

    const res = await http()
      .post('/api/chat/stream')
      .set(empleado)
      .send({ message: 'hola', conversationId: ajena.id });

    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toMatch(/application\/json/);
  });

  it('E2 y E3: la misma pregunta por POST /api/chat y por /stream da el mismo resultado', async () => {
    const viaPost = await http()
      .post('/api/chat')
      .set(empleado)
      .send({ message: '¿Cuál es el plazo?' });
    const viaStream = parseEvents(
      (await stream({ message: '¿Cuál es el plazo?' })).body as string,
    ).at(-1)!.data;

    expect(viaPost.status).toBe(200);
    const post = viaPost.body as Record<string, unknown>;
    expect(viaStream.status).toBe(post.status);
    expect(viaStream.answer).toBe(post.answer);
    expect(viaStream.sources).toEqual(post.sources);
    expect(viaStream).not.toHaveProperty('searchUrl');
  });
});
