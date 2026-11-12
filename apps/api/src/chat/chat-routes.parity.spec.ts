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
        llm: new FakeLlm(c.steps),
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
    const CONFLICT_CASES: Case[] = [
        { name: 'marca válida', rows: ROWS, steps: ['CONFLICT [S3] [S1]\n', 'Gerente [S1]; director [S3], y [S2].'] },
        { name: 'marca inválida (mismo documento)', rows: ROWS, steps: ['CONFLICT [S1] [S2]\n', 'Gerente [S2].'] },
        { name: 'marca sin explicación', rows: ROWS, steps: ['CONFLICT [S1] [S3]'] },
        { name: 'sin marca', rows: ROWS, steps: ['Lo aprueba ', 'el gerente [S1].'] },
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

        if (c.name === 'marca válida') {
            expect(viaPost).toMatchObject({
                status: 'conflict',
                answer: 'Gerente [S1]; director [S3], y.',
                sources: [{ chunkId: 'c1' }, { chunkId: 'c3' }],
            });
            expect(actualAlerts.recorded).toEqual([
                { messageId: 'msg-1', question: message, first: ROWS[0], second: ROWS[2] },
            ]);
        } else {
            expect(actualAlerts.recorded).toEqual([]);
        }
    });
});
