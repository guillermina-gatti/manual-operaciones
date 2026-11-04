import { NotFoundException } from '@nestjs/common';
import { EmbeddingProvider } from '../processing/ports/embedding-provider';
import { ChatService, MAX_COSINE_DISTANCE, NO_INFO_TEXT, UNAVAILABLE_TEXT } from './chat.service';
import { ChatLlm, type LlmAnswer, type Passage } from './ports/chat-llm';
import { ChatRepository, type SaveMessageInput } from './ports/chat-repository';
import { ChatRetrieval, type RetrievedChunk } from './ports/chat-retrieval';

const USER = { id: 'user-1', areaIds: ['area-1'] };

function chunk(overrides: Partial<RetrievedChunk> = {}): RetrievedChunk {
    return {
        chunkId: 'chunk-a',
        documentId: 'doc-1',
        documentTitle: 'Manual de compras',
        versionId: 'ver-1',
        versionNumber: 2,
        section: 'Aprobaciones',
        content: 'Las compras mayores a 100.000 requieren aprobación del supervisor.',
        validFrom: '2026-10-01',
        distance: 0.2,
        ...overrides,
    };
}

class FakeEmbeddings extends EmbeddingProvider {
    constructor(private readonly fail = false) {
        super();
    }
    async embedMany(texts: string[]): Promise<number[][]> {
        if (this.fail) throw new Error('embedding down');
        return texts.map(() => [0.1, 0.2, 0.3]);
    }
}

class FakeRetrieval extends ChatRetrieval {
    calls = 0;
    lastAreas: string[] = [];
    constructor(private readonly rows: RetrievedChunk[]) {
        super();
    }
    async search(_v: number[], areaIds: string[]): Promise<RetrievedChunk[]> {
        this.calls++;
        this.lastAreas = areaIds;
        return this.rows;
    }
}

class FakeLlm extends ChatLlm {
    lastPassages: Passage[] = [];
    constructor(private readonly reply: string | null) {
        super();
    }
    async answer(_q: string, passages: Passage[]): Promise<LlmAnswer> {
        this.lastPassages = passages;
        if (this.reply === null) throw new Error('model down');
        return { text: this.reply, modelName: 'fake-model', inputTokens: 10, outputTokens: 5 };
    }
}

class FakeRepository extends ChatRepository {
    saved: SaveMessageInput[] = [];
    constructor(private readonly owned: string[] = []) {
        super();
    }
    async resolveConversation(userId: string, conversationId: string | undefined): Promise<string | null> {
        if (!conversationId) return 'conv-new';
        return this.owned.includes(conversationId) ? conversationId : null;
    }
    async saveMessage(input: SaveMessageInput): Promise<string> {
        this.saved.push(input);
        return 'msg-1';
    }
}

function build(opts: {
    rows?: RetrievedChunk[];
    llmReply?: string | null;
    embeddingsFail?: boolean;
    owned?: string[];
}) {
    const retrieval = new FakeRetrieval(opts.rows ?? [chunk()]);
    const llm = new FakeLlm(opts.llmReply === undefined ? 'Debe pedir aprobación [S1].' : opts.llmReply);
    const repo = new FakeRepository(opts.owned);
    const service = new ChatService(new FakeEmbeddings(opts.embeddingsFail), retrieval, llm, repo);
    return { service, retrieval, llm, repo };
}

describe('ChatService (HU17)', () => {
    it('responde con estado answered y cita solo los fragmentos usados', async () => {
        const rows = [
            chunk({ chunkId: 'chunk-a' }),
            chunk({ chunkId: 'chunk-b', section: 'Plazos', distance: 0.3, content: 'Plazo: 5 días.' }),
        ];
        const { service, repo } = build({ rows, llmReply: 'El plazo es de 5 días [S2].' });

        const result = await service.ask(USER, { message: '¿Cuál es el plazo?' });

        expect(result.status).toBe('answered');
        expect(result.answer).toBe('El plazo es de 5 días [S2].');
        expect(result.sources.map((s) => s.chunkId)).toEqual(['chunk-b']);
        expect(repo.saved[0].usedChunkIds).toEqual(['chunk-b']);
        expect(repo.saved[0].status).toBe('answered');
    });

    it('usa solo las áreas del usuario al recuperar', async () => {
        const { service, retrieval } = build({});
        await service.ask(USER, { message: 'hola' });
        expect(retrieval.lastAreas).toEqual(['area-1']);
    });

    it('devuelve no_info sin llamar al modelo si el usuario no tiene áreas', async () => {
        const { service, retrieval, llm } = build({});
        const result = await service.ask({ id: 'user-1', areaIds: [] }, { message: 'hola' });

        expect(result.status).toBe('no_info');
        expect(retrieval.calls).toBe(0);
        expect(llm.lastPassages).toEqual([]);
    });

    it('devuelve no_info si ningún fragmento supera el umbral de relevancia', async () => {
        const { service } = build({ rows: [chunk({ distance: MAX_COSINE_DISTANCE + 0.1 })] });
        const result = await service.ask(USER, { message: 'algo irrelevante' });

        expect(result.status).toBe('no_info');
        expect(result.answer).toBe(NO_INFO_TEXT);
        expect(result.sources).toEqual([]);
    });

    it('devuelve no_info cuando el modelo responde NO_INFO', async () => {
        const { service, repo } = build({ llmReply: 'NO_INFO' });
        const result = await service.ask(USER, { message: 'pregunta fuera de tema' });

        expect(result.status).toBe('no_info');
        expect(repo.saved[0].status).toBe('no_info');
    });

    it('devuelve ai_unavailable si falla el embedding, sin consultar la base', async () => {
        const { service, retrieval } = build({ embeddingsFail: true });
        const result = await service.ask(USER, { message: 'hola' });

        expect(result.status).toBe('ai_unavailable');
        expect(result.answer).toBe(UNAVAILABLE_TEXT);
        expect(retrieval.calls).toBe(0);
    });

    it('devuelve ai_unavailable si falla el modelo', async () => {
        const { service, repo } = build({ llmReply: null });
        const result = await service.ask(USER, { message: 'hola' });

        expect(result.status).toBe('ai_unavailable');
        expect(repo.saved[0].status).toBe('ai_unavailable');
    });

    it('rechaza conversaciones que no pertenecen al usuario', async () => {
        const { service, retrieval } = build({ owned: ['conv-ajena'] });
        await expect(
            service.ask(USER, { message: 'hola', conversationId: 'conv-de-otro' }),
        ).rejects.toThrow(NotFoundException);
        expect(retrieval.calls).toBe(0);
    });
});