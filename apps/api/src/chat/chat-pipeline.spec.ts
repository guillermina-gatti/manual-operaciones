// Spec 009 (T01): la orquestación del chat, extraída de ChatService.run sin cambiar su comportamiento.
import { Logger } from '@nestjs/common';
import { EmbeddingProvider } from '../processing/ports/embedding-provider';
import {
    MAX_COSINE_DISTANCE,
    NO_INFO_TEXT,
    TOP_K,
    UNAVAILABLE_TEXT,
    citedChunks,
    finishChat,
    prepareChat,
    saveResult,
    toSources,
    unavailable,
} from './chat-pipeline';
import type { LlmAnswer } from './ports/chat-llm';
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
        content: 'Las compras mayores a 100.000 requieren aprobación del supervisor. El plazo de entrega es de 5 días.',
        validFrom: '2026-10-01',
        distance: 0.2,
        ...overrides,
    };
}

function answer(text: string): LlmAnswer {
    return { text, modelName: 'fake-model', inputTokens: 10, outputTokens: 5 };
}

class FakeEmbeddings extends EmbeddingProvider {
    calls = 0;
    constructor(private readonly fail = false) {
        super();
    }
    async embedMany(texts: string[]): Promise<number[][]> {
        this.calls++;
        if (this.fail) throw new Error('embedding down');
        return texts.map(() => [0.1, 0.2, 0.3]);
    }
}

class FakeRetrieval extends ChatRetrieval {
    calls: Array<{ vector: number[]; areaIds: string[]; limit: number }> = [];
    constructor(private readonly rows: RetrievedChunk[]) {
        super();
    }
    async search(vector: number[], areaIds: string[], limit: number): Promise<RetrievedChunk[]> {
        this.calls.push({ vector, areaIds, limit });
        return this.rows;
    }
}

class FakeRepository extends ChatRepository {
    saved: SaveMessageInput[] = [];
    async resolveConversation(): Promise<string | null> {
        return 'conv-1';
    }
    async saveMessage(input: SaveMessageInput): Promise<string> {
        this.saved.push(input);
        return 'msg-1';
    }
}

const logger = new Logger('ChatPipelineSpec');

describe('chat-pipeline (spec 009, T01)', () => {
    beforeEach(() => {
        jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('prepareChat', () => {
        it('sin áreas da no_info sin pedir el embedding ni recuperar', async () => {
            const embeddings = new FakeEmbeddings();
            const retrieval = new FakeRetrieval([chunk()]);

            const prepared = await prepareChat(embeddings, retrieval, { id: 'u', areaIds: [] }, 'algo', logger);

            expect(prepared).toEqual({
                kind: 'done',
                outcome: { status: 'no_info', answer: NO_INFO_TEXT, chunks: [] },
            });
            expect(embeddings.calls).toBe(0);
            expect(retrieval.calls).toHaveLength(0);
        });

        it('si falla el embedding da ai_unavailable sin recuperar, y lo deja en el log', async () => {
            const warn = jest.spyOn(logger, 'warn');
            const retrieval = new FakeRetrieval([chunk()]);

            const prepared = await prepareChat(new FakeEmbeddings(true), retrieval, USER, 'algo', logger);

            expect(prepared).toEqual({ kind: 'done', outcome: unavailable() });
            expect(retrieval.calls).toHaveLength(0);
            expect(warn).toHaveBeenCalledWith(expect.stringContaining('Falló el embedding de la consulta'));
        });

        it('recupera con el vector de la pregunta, las áreas del usuario y TOP_K', async () => {
            const retrieval = new FakeRetrieval([chunk()]);

            await prepareChat(new FakeEmbeddings(), retrieval, USER, '¿plazo?', logger);

            expect(retrieval.calls).toEqual([{ vector: [0.1, 0.2, 0.3], areaIds: ['area-1'], limit: TOP_K }]);
        });

        it('sin fragmentos dentro del umbral da no_info', async () => {
            const retrieval = new FakeRetrieval([chunk({ distance: MAX_COSINE_DISTANCE + 0.01 })]);

            const prepared = await prepareChat(new FakeEmbeddings(), retrieval, USER, 'algo', logger);

            // HU19: el documento más cercano se muestra, aunque esté fuera del umbral.
            expect(prepared).toEqual({
                kind: 'done',
                outcome: {
                    status: 'no_info',
                    answer: NO_INFO_TEXT,
                    chunks: [],
                    nearest: [{ documentId: 'doc-1', documentTitle: 'Manual de compras' }],
                },
            });
        });

        it('con fragmentos relevantes arma los pasajes S1, S2… en orden, sin los lejanos', async () => {
            const near = chunk({ chunkId: 'a', section: null });
            const limit = chunk({ chunkId: 'b', distance: MAX_COSINE_DISTANCE, documentTitle: 'Plazos' });
            const far = chunk({ chunkId: 'c', distance: MAX_COSINE_DISTANCE + 0.1 });

            const prepared = await prepareChat(
                new FakeEmbeddings(),
                new FakeRetrieval([near, limit, far]),
                USER,
                'pregunta',
                logger,
            );

            expect(prepared).toEqual({
                kind: 'ready',
                chunks: [near, limit],
                passages: [
                    {
                        ref: 'S1',
                        documentTitle: near.documentTitle,
                        section: null,
                        content: near.content,
                        documentId: near.documentId,
                    },
                    {
                        ref: 'S2',
                        documentTitle: 'Plazos',
                        section: limit.section,
                        content: limit.content,
                        documentId: limit.documentId,
                    },
                ],
            });
        });
    });

    describe('finishChat', () => {
        const chunks = [chunk({ chunkId: 'a' }), chunk({ chunkId: 'b' })];

        it('la marca NO_INFO da no_info, sin fragmentos y con los datos del modelo', () => {
            const llm = answer('NO_INFO');

            expect(finishChat(llm, chunks)).toEqual({
                status: 'no_info',
                answer: NO_INFO_TEXT,
                chunks: [],
                llm,
                nearest: [{ documentId: 'doc-1', documentTitle: 'Manual de compras' }],
            });
        });

        it('con [S2] responde el texto y solo el segundo fragmento', () => {
            const llm = answer('El plazo es de 5 días [S2].');

            expect(finishChat(llm, chunks)).toEqual({
                status: 'answered',
                answer: 'El plazo es de 5 días [S2].',
                chunks: [chunks[1]],
                llm,
            });
        });

        it('sin citas válidas, responde no_info (regla aprobada por Guille)', () => {
            expect(finishChat(answer('Sin marcas.'), chunks).status).toBe('no_info');
        });
    });

    describe('citedChunks y toSources', () => {
        it('una marca que no existe no suma fragmentos; si no queda ninguno, van todos', () => {
            const chunks = [chunk({ chunkId: 'a' })];

            expect(citedChunks('Ver [S9].', chunks)).toEqual(chunks);
            expect(citedChunks('Ver [S1] y [S1].', chunks)).toEqual(chunks);
        });

        it('toSources arma las fuentes del contrato, con "Sin sección" y la url vacía', () => {
            expect(toSources([chunk({ section: null })])).toEqual([
                {
                    documentId: 'doc-1',
                    documentTitle: 'Manual de compras',
                    versionNumber: 2,
                    section: 'Sin sección',
                    chunkId: 'chunk-a',
                    validFrom: '2026-10-01',
                    url: '',
                },
            ]);
        });

        it('unavailable es ai_unavailable con su texto y sin fragmentos', () => {
            expect(unavailable()).toEqual({ status: 'ai_unavailable', answer: UNAVAILABLE_TEXT, chunks: [] });
        });
    });

    describe('saveResult', () => {
        it('guarda el mensaje con los campos de siempre y arma el ChatResult', async () => {
            jest.spyOn(Date, 'now').mockReturnValue(1_250);
            const repository = new FakeRepository();
            const used = [
                chunk({ chunkId: 'a', versionId: 'v1' }),
                chunk({ chunkId: 'b', versionId: 'v1' }),
                chunk({ chunkId: 'c', versionId: 'v2' }),
            ];
            const llm = answer('Respuesta [S1].');

            const result = await saveResult(
                repository,
                'conv-1',
                '¿pregunta?',
                { status: 'answered', answer: 'Respuesta [S1].', chunks: used, llm },
                1_000,
            );

            expect(repository.saved).toEqual([
                {
                    conversationId: 'conv-1',
                    question: '¿pregunta?',
                    answer: 'Respuesta [S1].',
                    status: 'answered',
                    usedChunkIds: ['a', 'b', 'c'],
                    usedVersionIds: ['v1', 'v2'],
                    modelName: 'fake-model',
                    latencyMs: 250,
                    inputTokens: 10,
                    outputTokens: 5,
                },
            ]);
            expect(result).toEqual({
                conversationId: 'conv-1',
                messageId: 'msg-1',
                status: 'answered',
                answer: 'Respuesta [S1].',
                sources: toSources(used),
            });
        });

        it('sin modelo (no_info o ai_unavailable) guarda los datos del modelo vacíos', async () => {
            const repository = new FakeRepository();

            await saveResult(repository, 'conv-1', 'hola', unavailable(), Date.now());

            expect(repository.saved[0]).toMatchObject({
                status: 'ai_unavailable',
                usedChunkIds: [],
                usedVersionIds: [],
                modelName: undefined,
                inputTokens: undefined,
                outputTokens: undefined,
            });
        });
    });
});

// Spec 010 (T05, R8): con el paso, el embedding se calcula con otro texto (el título del paso y la
// pregunta). Por defecto, la pregunta, como siempre.
describe('prepareChat: el texto del embedding (spec 010)', () => {
    class RecordingEmbeddings extends EmbeddingProvider {
        texts: string[][] = [];
        async embedMany(texts: string[]): Promise<number[][]> {
            this.texts.push(texts);
            return texts.map(() => [0.1, 0.2, 0.3]);
        }
    }

    it('E3: con searchText, el embedding recibe ese texto', async () => {
        const embeddings = new RecordingEmbeddings();

        const searchText = 'Contar el efectivo\n¿qué hago acá?';

        await prepareChat(embeddings, new FakeRetrieval([chunk()]), USER, '¿qué hago acá?', logger, searchText);

        expect(embeddings.texts).toEqual([[searchText]]);
    });

    it('sin searchText, la pregunta', async () => {
        const embeddings = new RecordingEmbeddings();

        await prepareChat(embeddings, new FakeRetrieval([chunk()]), USER, '¿qué hago acá?', logger);

        expect(embeddings.texts).toEqual([['¿qué hago acá?']]);
    });
});

// Spec 011 (T03, R5 a R7): finishChat reconoce la marca de contradicción, después de NO_INFO.
describe('finishChat: la marca de contradicción (spec 011)', () => {
    const chunks = [
        chunk({ chunkId: 'c1', documentId: 'doc-compras', versionId: 'v-compras' }),
        chunk({ chunkId: 'c2', documentId: 'doc-compras', versionId: 'v-compras' }),
        chunk({ chunkId: 'c3', documentId: 'doc-gastos', versionId: 'v-gastos', documentTitle: 'Política de gastos' }),
    ];
    const warnings = () => {
        const warn = jest.fn();
        return { warn, logger: { warn } };
    };

    it('E1: una marca válida da conflict, sin la línea, con los dos fragmentos en orden', () => {
        const llm = answer('CONFLICT [S3] [S1]\nEl manual dice gerente [S1]; la política, director [S3].');

        expect(finishChat(llm, chunks)).toEqual({
            status: 'conflict',
            answer: 'El manual dice gerente [S1]; la política, director [S3].',
            chunks: [chunks[0], chunks[2]],
            conflict: { first: chunks[0], second: chunks[2] },
            llm,
        });
    });

    it('R7: quita de la explicación las marcas de otros pasajes', () => {
        const llm = answer('CONFLICT [S1] [S3]\nGerente [S1], director [S3], como dice también [S2].');

        expect(finishChat(llm, chunks).answer).toBe('Gerente [S1], director [S3], como dice también.');
    });

    it('E6: una marca inválida es answered sin la línea, y queda en el log', () => {
        const { warn, logger } = warnings();
        const llm = answer('CONFLICT [S1] [S2]\nLo aprueba el gerente [S2].');

        expect(finishChat(llm, chunks, logger)).toEqual({
            status: 'answered',
            answer: 'Lo aprueba el gerente [S2].',
            chunks: [chunks[1]],
            llm,
        });
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('mismo documento'));
    });

    it('una marca inválida sin explicación es no_info', () => {
        const llm = answer('CONFLICT [S1] [S3]');

        expect(finishChat(llm, chunks)).toEqual({
            status: 'no_info',
            answer: NO_INFO_TEXT,
            chunks: [],
            llm,
            nearest: [
                { documentId: 'doc-compras', documentTitle: 'Manual de compras' },
                { documentId: 'doc-gastos', documentTitle: 'Política de gastos' },
            ],
        });
    });

    it('NO_INFO sigue primero', () => {
        expect(finishChat(answer('NO_INFO'), chunks).status).toBe('no_info');
    });

    it('E17: sin la marca, lo de siempre y sin el campo conflict', () => {
        const { warn, logger } = warnings();
        const outcome = finishChat(answer('Lo aprueba el gerente [S1].'), chunks, logger);

        expect(outcome).toEqual({
            status: 'answered',
            answer: 'Lo aprueba el gerente [S1].',
            chunks: [chunks[0]],
            llm: answer('Lo aprueba el gerente [S1].'),
        });
        expect(outcome).not.toHaveProperty('conflict');
        expect(warn).not.toHaveBeenCalled();
    });
});