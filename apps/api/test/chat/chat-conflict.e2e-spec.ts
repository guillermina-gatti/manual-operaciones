/* Spec 011 (T09): las contradicciones de punta a punta, con la base de tests. El modelo y los
embeddings son simulados (ningún test llama a Gemini); la recuperación, el guardado, el registro de
la alerta y el guard son los reales. */

import request from 'supertest';
import { EmbeddingProvider } from '../../src/processing/ports/embedding-provider';
import {
  ChatLlm,
  type LlmAnswer,
  type Passage,
} from '../../src/chat/ports/chat-llm';
import { AREA_IDS, FIXTURE_USERS } from '../../src/documents/adapters/fixtures';
import {
  type ChunkedDocument,
  readAlerts,
  resolveAlert,
  seedChunkedDocument,
  seedNewVersion,
} from '../documents/conflict-helpers';
import {
  DocumentsTestApp,
  authHeaders,
  cleanDocuments,
  createDocumentsTestApp,
} from '../documents/helpers';
import { FixedEmbeddings, asText, parseEvents } from './helpers';

// Responde lo que diga el test y guarda los pasajes que recibió. stream usa la implementación por
// defecto del puerto (una sola parte), que alcanza para el retén.
class ScriptedLlm extends ChatLlm {
  text = '';
  passages: Passage[][] = [];
  answer(_question: string, passages: Passage[]): Promise<LlmAnswer> {
    this.passages.push(passages);
    return Promise.resolve({ text: this.text, modelName: 'fake-model' });
  }
}

const QUESTION = '¿Quién aprueba una compra de $800.000?';
const EXPLANATION =
  'El manual dice que la aprueba el gerente [S1]; la política, que el director [S2].';

describe('Contradicciones del asistente (integración, spec 011)', () => {
  let t: DocumentsTestApp;
  const llm = new ScriptedLlm();
  const empleado = authHeaders(FIXTURE_USERS.empleadoVentas);
  const http = () => request(t.app.getHttpServer());

  const viaPost = (headers = empleado) =>
    http()
      .post('/api/chat')
      .set(headers)
      .send({ message: QUESTION })
      .expect(200);
  const viaStream = async (headers = empleado) => {
    const res = await http()
      .post('/api/chat/stream')
      .set(headers)
      .send({ message: QUESTION })
      .buffer(true)
      .parse(asText as never)
      .expect(200);
    return parseEvents(res.body as string);
  };

  let manual: ChunkedDocument;
  let politica: ChunkedDocument;

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
    llm.text = `CONFLICT [S1] [S2]\n${EXPLANATION}`;
    llm.passages = [];
    manual = await seedChunkedDocument(t.prisma, {
      areaIds: [AREA_IDS.ventas],
      title: 'Manual de compras',
      content: 'Las compras de más de $500.000 las aprueba el gerente.',
    });
    politica = await seedChunkedDocument(t.prisma, {
      areaIds: [AREA_IDS.ventas],
      title: 'Política de gastos',
      content: 'Las compras de más de $500.000 las aprueba el director.',
    });
  });

  const pairIds = () =>
    [manual, politica].sort((p, q) => (p.id < q.id ? -1 : 1));

  it('E1, E3: las dos rutas responden conflict con las dos fuentes y registran la misma alerta', async () => {
    const post = (await viaPost()).body as Record<string, unknown>;
    const events = await viaStream();
    const done = events.find((e) => e.event === 'done')!.data;

    for (const result of [post, done]) {
      expect(result).toMatchObject({ status: 'conflict', answer: EXPLANATION });
      expect(
        (result.sources as { documentId: string }[])
          .map((s) => s.documentId)
          .sort(),
      ).toEqual([manual.id, politica.id].sort());
    }
    expect(events.map((e) => e.event)).toEqual(['start', 'done']); // E4: sin delta

    const messages = await t.prisma.message.findMany({
      where: { question: QUESTION },
    });
    expect(messages.map((m) => m.status)).toEqual(['CONFLICT', 'CONFLICT']);
    expect(messages[0].usedChunkIds.sort()).toEqual(
      [manual.chunkId, politica.chunkId].sort(),
    );

    const [a, b] = pairIds();
    const alerts = await readAlerts(t.prisma);
    expect(alerts).toEqual([
      expect.objectContaining({
        document_a_id: a.id,
        document_b_id: b.id,
        version_a_id: a.versionId,
        version_b_id: b.versionId,
        question: QUESTION,
        status: 'OPEN',
        occurrences: 2,
      }),
    ]);
  });

  it('E8: con los pasajes al revés es la misma alerta, y dos pedidos a la vez suman 2', async () => {
    await viaPost();
    llm.text = `CONFLICT [S2] [S1]\n${EXPLANATION}`;
    await viaPost();
    expect((await readAlerts(t.prisma)).map((a) => a.occurrences)).toEqual([2]);

    await cleanDocuments(t.prisma);
    manual = await seedChunkedDocument(t.prisma, {
      areaIds: [AREA_IDS.ventas],
      title: 'Manual de compras',
      content: 'Gerente.',
    });
    politica = await seedChunkedDocument(t.prisma, {
      areaIds: [AREA_IDS.ventas],
      title: 'Política de gastos',
      content: 'Director.',
    });
    await Promise.all([viaPost(), viaPost()]);

    expect((await readAlerts(t.prisma)).map((a) => a.occurrences)).toEqual([2]);
  });

  it('E9: una alerta resuelta no cambia ni se crea otra', async () => {
    await viaPost();
    const [alert] = await readAlerts(t.prisma);
    await resolveAlert(t.prisma, alert.id);

    await viaPost();

    expect(await readAlerts(t.prisma)).toEqual([
      expect.objectContaining({
        id: alert.id,
        status: 'RESOLVED',
        occurrences: 1,
      }),
    ]);
  });

  it('E10: con una versión nueva de uno de los documentos, una alerta nueva', async () => {
    await viaPost();
    const [old] = await readAlerts(t.prisma);
    await resolveAlert(t.prisma, old.id);
    politica = await seedNewVersion(t.prisma, politica, {
      areaIds: [AREA_IDS.ventas],
      content:
        'Las compras de más de $500.000 las aprueba el director general.',
    });

    await viaPost();

    const alerts = await readAlerts(t.prisma);
    expect(alerts).toHaveLength(2);
    expect(alerts[1]).toMatchObject({ status: 'OPEN', occurrences: 1 });
    expect([alerts[1].version_a_id, alerts[1].version_b_id]).toContain(
      politica.versionId,
    );
  });

  it('E7: un documento de un área que el usuario no ve no llega al modelo', async () => {
    await seedChunkedDocument(t.prisma, {
      areaIds: [AREA_IDS.operaciones],
      title: 'Instructivo de Operaciones',
      content: 'Las compras de más de $500.000 las aprueba el jefe de planta.',
    });
    llm.text = 'Lo aprueba el gerente [S1].';

    await viaPost();

    const titles = llm.passages[0].map((p) => p.documentTitle).sort();
    expect(titles).toEqual(['Manual de compras', 'Política de gastos']);
  });

  it('E5: una versión reemplazada no llega al modelo, aunque sus fragmentos sigan activos', async () => {
    await seedNewVersion(t.prisma, manual, {
      areaIds: [AREA_IDS.ventas],
      content:
        'Desde la v2, las compras de más de $500.000 las aprueba el director.',
      keepOldChunksActive: true,
    });
    llm.text = 'Lo aprueba el director [S1].';

    const result = (await viaPost()).body as { status: string };

    const contents = llm.passages[0].map((p) => p.content);
    expect(contents).not.toContain(
      'Las compras de más de $500.000 las aprueba el gerente.',
    );
    expect(contents).toContain(
      'Desde la v2, las compras de más de $500.000 las aprueba el director.',
    );
    expect(result.status).toBe('answered');
    expect(await readAlerts(t.prisma)).toEqual([]);
  });

  it('E6: una marca con el mismo pasaje dos veces es answered, sin alerta', async () => {
    llm.text = 'CONFLICT [S1] [S1]\nLo aprueba el gerente [S1].';

    const result = (await viaPost()).body as { status: string; answer: string };

    expect(result).toMatchObject({
      status: 'answered',
      answer: 'Lo aprueba el gerente [S1].',
    });
    expect(await readAlerts(t.prisma)).toEqual([]);
  });

  it('E17: sin la marca no se escribe en la tabla de alertas', async () => {
    llm.text = 'Lo aprueba el gerente [S1].';

    await viaPost();
    await viaStream();

    expect(await readAlerts(t.prisma)).toEqual([]);
  });
});
