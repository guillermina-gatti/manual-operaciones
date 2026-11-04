// Spec 009 (T07, R4, D8): las dos rutas del chat responden lo mismo. ChatService es el de
// POST /api/chat; ChatStreamService, el de POST /api/chat/stream. Mismos simulados, mismos casos.
import { Logger } from '@nestjs/common';
import { MAX_COSINE_DISTANCE } from './chat-pipeline';
import { ChatService } from './chat.service';
import { ChatStreamService } from './chat-stream.service';
import {
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
