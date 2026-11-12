// Spec 009 (T07, R4, D8): las dos rutas del chat responden lo mismo. ChatService es el de
// POST /api/chat; ChatStreamService, el de POST /api/chat/stream. Mismos simulados, mismos casos.
import { Logger } from '@nestjs/common';
import { MAX_COSINE_DISTANCE } from './chat-pipeline';
import { ChatService } from './chat.service';
import { ChatStreamService } from './chat-stream.service';
import {
    CONTEXT_STEP,
    CONTEXT_VERSION,
    FakeConflictAlertRecorder,
    FakeContextStore,
    FakeEmbeddings,
    FakeLlm,
    FakeRepository,
    FakeRetrieval,
    type LlmStep,
    RecordingSink,
    USER,
    chunk,
} from './testing/chat-fakes';

interface Case {
    name: string;
    rows?: ReturnType<typeof chunk>[];
    steps: LlmStep[] | null;
    later?: Array<LlmStep[] | null>; // spec 011 (ajuste del 11/11/2026): los pasos del segundo pedido
    embeddings?: 'ok' | 'fail';
    user?: { id: string; areaIds: string[] };
}

const TWO = [chunk({ chunkId: 'a' }), chunk({ chunkId: 'b', section: 'Plazos', content: 'Plazo: 5 días.' })];

const CASES: Case[] = [
    { name: 'answered con [S2]', rows: TWO, steps: ['El plazo ', 'es de 5 días [S2].'] },
    { name: 'answered sin citas', rows: TWO, steps: ['Hay que pedir ', 'aprobación.'] },
    // Spec 009 (ajuste del 12/11/2026): citas agrupadas y una que no existe.
    { name: 'citas agrupadas y una inexistente', rows: TWO, steps: ['Hay que pedir aprobación ', '[S1, S2]. Ver también [S4].'] },
    { name: 'umbral', rows: [chunk({ distance: MAX_COSINE_DISTANCE + 0.1 })], steps: ['nunca'] },
    { name: 'NO_INFO', steps: ['NO_', 'INFO'] },
    { name: 'sin áreas', steps: ['nunca'], user: { id: 'user-1', areaIds: [] } },
    { name: 'embedding caído', steps: ['nunca'], embeddings: 'fail' },
    { name: 'modelo caído antes de la primera parte', steps: null },
];

function deps(c: Case) {
    return {
        embeddings: new FakeEmbeddings(c.embeddings),
        retrieval: new FakeRetrieval(c.rows ?? [chunk()]),
        llm: new FakeLlm(c.steps, ...(c.later ?? [])),
        repo: new FakeRepository(),
    };
}

describe('las dos rutas del chat responden lo mismo (spec 009, E2)', () => {
    beforeEach(() => {
        jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it.each(CASES)('$name', async (c) => {
        const user = c.user ?? USER;
        const message = '¿Cuál es el plazo?';

        const actual = deps(c);
        const service = new ChatService(actual.embeddings, actual.retrieval, actual.llm, actual.repo);
        const viaPost = await service.ask(user, { message });

        const streamed = deps(c);
        const streamService = new ChatStreamService(
            streamed.embeddings,
            streamed.retrieval,
            streamed.llm,
            streamed.repo,
        );
        const sink = new RecordingSink();
        const opened = await streamService.open(user, { message });
        await streamService.run(user, opened, sink, new AbortController().signal);
        const viaStream = sink.final;

        expect(viaStream).toBeDefined();
        const { searchUrl, ...sameShape } = viaStream!;
        expect(sameShape).toEqual(viaPost);
        expect(searchUrl === undefined).toBe(viaPost.status !== 'ai_unavailable');

        const withoutLatency = ({ latencyMs: _latency, ...rest }: { latencyMs: number }) => rest;
        expect(streamed.repo.saved.map(withoutLatency)).toEqual(actual.repo.saved.map(withoutLatency));
    });
});

// Spec 010 (T07, R13, E6): las dos rutas también responden lo mismo con el contexto del paso, y le
// pasan al modelo el mismo contexto y al embedding el mismo texto.
describe('las dos rutas del chat responden lo mismo con contexto (spec 010, E6)', () => {
    const context = { procedureVersionId: CONTEXT_VERSION, stepId: CONTEXT_STEP };

    beforeEach(() => {
        jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it.each(CASES.filter((c) => c.name !== 'sin áreas'))('$name', async (c) => {
        const user = { ...USER, role: 'EMPLOYEE' as const };
        const message = '¿Qué hago acá?';

        const actual = deps(c);
        const actualStore = new FakeContextStore();
        const service = new ChatService(actual.embeddings, actual.retrieval, actual.llm, actual.repo, actualStore);
        const viaPost = await service.ask(user, { message, context });

        const streamed = deps(c);
        const streamedStore = new FakeContextStore();
        const streamService = new ChatStreamService(
            streamed.embeddings,
            streamed.retrieval,
            streamed.llm,
            streamed.repo,
            streamedStore,
        );
        const sink = new RecordingSink();
        const opened = await streamService.open(user, { message, context });
        await streamService.run(user, opened, sink, new AbortController().signal);

        const { searchUrl: _searchUrl, ...sameShape } = sink.final!;
        expect(sameShape).toEqual(viaPost);
        expect(streamed.llm.contexts).toEqual(actual.llm.contexts);
        expect(streamed.embeddings.texts).toEqual(actual.embeddings.texts);
        expect(streamedStore.saved).toEqual(actualStore.saved);
        expect(actualStore.saved).toEqual([{ conversationId: 'conv-new', step: context }]);
        if (c.embeddings !== 'fail') {
            expect(actual.embeddings.texts).toEqual([['Contar el efectivo\n¿Qué hago acá?']]);
        }
    });
});

// Spec 011 (T07, R8, R12, E3): con la marca de contradicción, las dos rutas responden lo mismo,
// guardan lo mismo y le pasan lo mismo al ConflictAlertRecorder. Con una marca inválida, igual.
describe('las dos rutas del chat responden lo mismo con una contradicción (spec 011, E3)', () => {
    const ROWS = [
        chunk({ chunkId: 'c1', documentId: 'doc-compras', versionId: 'v-compras' }),
        chunk({ chunkId: 'c2', documentId: 'doc-compras', versionId: 'v-compras' }),
        chunk({ chunkId: 'c3', documentId: 'doc-gastos', versionId: 'v-gastos', documentTitle: 'Política de gastos' }),
    ];
    const ROPA_INTERIOR = [
        chunk({ chunkId: 'r1', documentId: 'doc-politica', versionId: 'v-politica', documentTitle: 'Política de devoluciones', section: 'Productos sin cambio ni devolución', content: 'Los productos de higiene personal y la ropa interior no tienen cambio ni devolución.' }),
        chunk({ chunkId: 'r2', documentId: 'doc-promo', versionId: 'v-promo', documentTitle: 'Promoción de verano', section: 'Productos en oferta', content: 'Los productos en oferta también se pueden devolver.' }),
        chunk({ chunkId: 'r3', documentId: 'doc-promo', versionId: 'v-promo', documentTitle: 'Promoción de verano', section: 'Plazo de devolución', content: 'El cliente puede devolver cualquier producto dentro de los 60 días corridos.' }),
    ];
    const CONFLICT_CASES: Case[] = [
        { name: 'marca válida', rows: ROWS, steps: ['CONFLICT [S3] [S1]\n', 'Gerente [S1]; director [S3], y [S2].'] },
        { name: 'marca inválida (mismo documento)', rows: ROWS, steps: ['CONFLICT [S1] [S2]\n', 'Gerente [S2].'] },
        // Ajuste del 11/11/2026: con la marca del mismo documento, un segundo pedido.
        {
            name: 'mismo documento: responde el segundo pedido',
            rows: ROWS,
            steps: ['CONFLICT [S1] [S2]\n', 'Gerente [S2].'],
            later: [['No: lo aprueba ', 'el gerente [S1].']],
        },
        {
            name: 'mismo documento: falla el segundo pedido',
            rows: ROWS,
            steps: ['CONFLICT [S1] [S2]\n', 'Gerente [S2].'],
            later: [[{ fail: 'quota' }]],
        },
        // Ajuste del 12/11/2026: si el segundo pedido igual marca, se saca la línea y queda su resto.
        {
            name: 'mismo documento: el segundo pedido vuelve a marcar',
            rows: ROWS,
            steps: ['CONFLICT [S1] [S2]\n', 'Gerente [S2].'],
            later: [['CONFLICT [S1] [S3]\n', 'No: lo aprueba ', 'el gerente [S1].']],
        },
        {
            name: 'mismo documento: el segundo pedido trae solo la marca',
            rows: ROWS,
            steps: ['CONFLICT [S1] [S2]\n', 'Gerente [S2].'],
            later: [['CONFLICT [S1] [S2]']],
        },
        // El caso real: el modelo marcó CONFLICT entre S1 y S3, dos pasajes de la misma Política, y
        // respondía la explicación con viñetas, sin conclusión.
        {
            name: 'ropa interior: la marca entre dos pasajes de la Política',
            rows: [
                ROPA_INTERIOR[0],
                ROPA_INTERIOR[1],
                { ...ROPA_INTERIOR[0], chunkId: 'r4', section: 'Ofertas', content: 'Los productos en oferta solo se cambian por otro talle o color.' },
            ],
            steps: ['CONFLICT [S1] [S3]\n', '* [S1] dice que no tiene devolución.\n* [S3] regula las ofertas.'],
            later: [['No: la ropa interior ', 'no tiene cambio ni devolución [S1].']],
        },
        { name: 'marca inválida (pasaje que no existe)', rows: ROWS, steps: ['CONFLICT [S1] [S9]\n', 'Gerente [S2].'] },
        { name: 'marca sin explicación', rows: ROWS, steps: ['CONFLICT [S1] [S3]'] },
        { name: 'sin marca', rows: ROWS, steps: ['Lo aprueba ', 'el gerente [S1].'] },
        // Ajuste del 12/11/2026, caso real: "¿Se puede devolver ropa interior?". La Política (la excepción) y la
        // Promoción de verano ("cualquier producto") son documentos distintos: CONFLICT entre S1 y S3.
        {
            name: 'ropa interior: la Política y la Promoción de verano',
            rows: ROPA_INTERIOR,
            steps: [
                'CONFLICT [S1] [S3]\n',
                '[S1] dice que la ropa interior no tiene devolución; [S3], que cualquier producto se devuelve en 60 días.',
            ],
        },
    ];

    beforeEach(() => {
        jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it.each(CONFLICT_CASES)('$name', async (c) => {
        const message = '¿Quién aprueba una compra de $800.000?';

        const actual = deps(c);
        const actualAlerts = new FakeConflictAlertRecorder();
        const service = new ChatService(
            actual.embeddings,
            actual.retrieval,
            actual.llm,
            actual.repo,
            undefined,
            actualAlerts,
        );
        const viaPost = await service.ask(USER, { message });

        const streamed = deps(c);
        const streamedAlerts = new FakeConflictAlertRecorder();
        const streamService = new ChatStreamService(
            streamed.embeddings,
            streamed.retrieval,
            streamed.llm,
            streamed.repo,
            undefined,
            streamedAlerts,
        );
        const sink = new RecordingSink();
        const opened = await streamService.open(USER, { message });
        await streamService.run(USER, opened, sink, new AbortController().signal);

        expect(sink.final).toEqual(viaPost);
        const withoutLatency = ({ latencyMs: _latency, ...rest }: { latencyMs: number }) => rest;
        expect(streamed.repo.saved.map(withoutLatency)).toEqual(actual.repo.saved.map(withoutLatency));
        expect(streamedAlerts.recorded).toEqual(actualAlerts.recorded);
        expect(streamed.llm.options).toEqual(actual.llm.options);
        if (c.name === 'ropa interior: la marca entre dos pasajes de la Política') {
            expect(actual.llm.options).toEqual([undefined, { sameDocumentRefs: ['S1', 'S3'] }]);
            expect(viaPost).toMatchObject({
                status: 'answered',
                answer: 'No: la ropa interior no tiene cambio ni devolución [S1].',
                sources: [{ chunkId: 'r1' }],
            });
        } else if (c.name.startsWith('mismo documento') || c.name === 'marca inválida (mismo documento)') {
            expect(actual.llm.options).toEqual([undefined, { sameDocumentRefs: ['S1', 'S2'] }]);
        } else {
            expect(actual.llm.options).toEqual([undefined]);
        }
        if (c.name === 'mismo documento: el segundo pedido vuelve a marcar') {
            expect(viaPost).toMatchObject({ status: 'answered', answer: 'No: lo aprueba el gerente [S1].' });
        }
        if (c.name === 'mismo documento: el segundo pedido trae solo la marca') {
            expect(viaPost.status).toBe('no_info');
        }
        if (c.name === 'mismo documento: responde el segundo pedido') {
            expect(viaPost).toMatchObject({ status: 'answered', answer: 'No: lo aprueba el gerente [S1].' });
            expect(actual.repo.saved[0]).toMatchObject({ inputTokens: 20, outputTokens: 10 });
        }

        if (c.name === 'marca válida') {
            expect(viaPost).toMatchObject({
                status: 'conflict',
                answer: 'Gerente [S1]; director [S3], y.',
                sources: [{ chunkId: 'c1' }, { chunkId: 'c3' }],
            });
            expect(actualAlerts.recorded).toEqual([
                { messageId: 'msg-1', question: message, first: ROWS[0], second: ROWS[2] },
            ]);
        } else if (c.name === 'ropa interior: la Política y la Promoción de verano') {
            expect(viaPost).toMatchObject({ status: 'conflict', sources: [{ chunkId: 'r1' }, { chunkId: 'r3' }] });
            expect(actualAlerts.recorded).toEqual([
                { messageId: 'msg-1', question: message, first: ROPA_INTERIOR[0], second: ROPA_INTERIOR[2] },
            ]);
        } else {
            expect(actualAlerts.recorded).toEqual([]);
        }
    });
});
