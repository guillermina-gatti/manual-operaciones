// HU19: sin información suficiente. Los documentos más cercanos (que no cuentan como usados) y a quién
// consultar. Cubre el pipeline, el resolver y los dos caminos (POST /api/chat y el streaming).
import { Logger } from '@nestjs/common';
import { MAX_COSINE_DISTANCE, NEAREST_DOCUMENTS_LIMIT, NO_INFO_TEXT, finishChat, nearestOf, prepareChat, saveResult, type Outcome } from './chat-pipeline';
import { resolveSuggestion } from './chat-contact';
import { ChatService } from './chat.service';
import { ChatStreamService } from './chat-stream.service';
import type { ContactPerson } from './ports/contact-directory';
import { ContactDirectory } from './ports/contact-directory';
import type { LlmAnswer } from './ports/chat-llm';
import {
    CONTEXT_STEP,
    CONTEXT_VERSION,
    FakeContextStore,
    FakeEmbeddings,
    FakeLlm,
    FakeRepository,
    FakeRetrieval,
    RecordingSink,
    USER,
    chunk,
    stepRecord,
} from './testing/chat-fakes';

const far = MAX_COSINE_DISTANCE + 0.1;
const logger = new Logger('ChatNoInfoSpec');

// Un directorio de contacto con respuestas fijas. fail: todas las lecturas fallan.
class FakeContactDirectory extends ContactDirectory {
    procedureLookups: string[] = [];
    documentLookups: string[] = [];
    constructor(
        private readonly procedureOwner: ContactPerson | null = null,
        private readonly documentOwners: Record<string, ContactPerson | null> = {},
        private readonly fail = false,
    ) {
        super();
    }
    async findProcedureOwner(procedureVersionId: string): Promise<ContactPerson | null> {
        this.procedureLookups.push(procedureVersionId);
        if (this.fail) throw new Error('db down');
        return this.procedureOwner;
    }
    async findDocumentOwner(documentId: string): Promise<ContactPerson | null> {
        this.documentLookups.push(documentId);
        if (this.fail) throw new Error('db down');
        return this.documentOwners[documentId] ?? null;
    }
}

const ANA = { name: 'Ana Pérez', email: 'ana@example.com' };
const LUCAS = { name: 'Lucas Gómez', email: 'lucas@example.com' };

function warnSpy() {
    return jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
}

describe('HU19 · nearestOf', () => {
    it('devuelve los documentos distintos, en orden de cercanía, sin repetir', () => {
        const chunks = [
            chunk({ chunkId: 'a', documentId: 'doc-1', documentTitle: 'Compras' }),
            chunk({ chunkId: 'b', documentId: 'doc-1', documentTitle: 'Compras' }),
            chunk({ chunkId: 'c', documentId: 'doc-2', documentTitle: 'Gastos' }),
        ];

        expect(nearestOf(chunks)).toEqual({
            nearest: [
                { documentId: 'doc-1', documentTitle: 'Compras' },
                { documentId: 'doc-2', documentTitle: 'Gastos' },
            ],
        });
    });

    it(`no muestra más de ${NEAREST_DOCUMENTS_LIMIT} documentos`, () => {
        const chunks = [1, 2, 3, 4, 5].map((n) => chunk({ chunkId: `c${n}`, documentId: `doc-${n}` }));

        expect(nearestOf(chunks).nearest).toHaveLength(NEAREST_DOCUMENTS_LIMIT);
        expect(nearestOf(chunks).nearest?.[0].documentId).toBe('doc-1');
    });

    it('sin fragmentos no agrega el campo', () => {
        expect(nearestOf([])).toEqual({});
        expect(nearestOf([])).not.toHaveProperty('nearest');
    });
});

describe('HU19 · prepareChat y finishChat', () => {
    it('fuera del umbral, da no_info con los más cercanos y sin fragmentos usados', async () => {
        const retrieval = new FakeRetrieval([
            chunk({ chunkId: 'a', documentId: 'doc-1', documentTitle: 'Compras', distance: far }),
            chunk({ chunkId: 'b', documentId: 'doc-2', documentTitle: 'Gastos', distance: far + 0.01 }),
        ]);

        const prepared = await prepareChat(new FakeEmbeddings(), retrieval, USER, '¿plazo?', logger);

        expect(prepared).toEqual({
            kind: 'done',
            outcome: {
                status: 'no_info',
                answer: NO_INFO_TEXT,
                chunks: [],
                nearest: [
                    { documentId: 'doc-1', documentTitle: 'Compras' },
                    { documentId: 'doc-2', documentTitle: 'Gastos' },
                ],
            },
        });
    });

    it('sin ningún fragmento recuperado, no agrega documentos cercanos', async () => {
        const prepared = await prepareChat(new FakeEmbeddings(), new FakeRetrieval([]), USER, '¿plazo?', logger);

        expect(prepared).toEqual({ kind: 'done', outcome: { status: 'no_info', answer: NO_INFO_TEXT, chunks: [] } });
    });

    it('si el modelo dice NO_INFO, los documentos cercanos son los fragmentos que llegaron a él', () => {
        const chunks = [chunk({ chunkId: 'a', documentId: 'doc-9', documentTitle: 'Procedimiento de caja' })];
        const llm: LlmAnswer = { text: 'NO_INFO', modelName: 'fake', inputTokens: 1, outputTokens: 1 };

        const outcome = finishChat(llm, chunks);

        expect(outcome.status).toBe('no_info');
        expect(outcome.chunks).toEqual([]);
        expect(outcome.nearest).toEqual([{ documentId: 'doc-9', documentTitle: 'Procedimiento de caja' }]);
    });
});

describe('HU19 · saveResult', () => {
    it('con no_info, el resultado trae los documentos cercanos y no guarda usedChunkIds', async () => {
        const repository = new FakeRepository();
        const outcome: Outcome = {
            status: 'no_info',
            answer: NO_INFO_TEXT,
            chunks: [],
            nearest: [{ documentId: 'doc-1', documentTitle: 'Compras' }],
        };

        const result = await saveResult(repository, 'conv-1', '¿plazo?', outcome, Date.now());

        expect(result.nearestDocuments).toEqual([{ documentId: 'doc-1', documentTitle: 'Compras' }]);
        expect(repository.saved[0].usedChunkIds).toEqual([]);
        expect(repository.saved[0].usedVersionIds).toEqual([]);
    });

    it('sin nada de HU19, el resultado no trae los campos nuevos', async () => {
        const result = await saveResult(
            new FakeRepository(),
            'conv-1',
            'hola',
            { status: 'no_info', answer: NO_INFO_TEXT, chunks: [] },
            Date.now(),
        );

        expect(result).not.toHaveProperty('nearestDocuments');
        expect(result).not.toHaveProperty('suggestedContact');
    });
});

describe('HU19 · resolveSuggestion', () => {
    const noInfo: Outcome = {
        status: 'no_info',
        answer: NO_INFO_TEXT,
        chunks: [],
        nearest: [{ documentId: 'doc-1', documentTitle: 'Compras' }],
    };

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('sin directorio, el resultado queda igual', async () => {
        expect(await resolveSuggestion(undefined, noInfo, undefined, logger)).toBe(noInfo);
    });

    it('si la respuesta no es no_info, no busca a nadie', async () => {
        const directory = new FakeContactDirectory(ANA);
        const answered: Outcome = { status: 'answered', answer: 'Sí [S1].', chunks: [] };

        expect(await resolveSuggestion(directory, answered, undefined, logger)).toBe(answered);
        expect(directory.documentLookups).toEqual([]);
        expect(directory.procedureLookups).toEqual([]);
    });

    it('sin contexto de paso, sugiere al responsable del documento más cercano', async () => {
        const directory = new FakeContactDirectory(null, { 'doc-1': LUCAS });

        const outcome = await resolveSuggestion(directory, noInfo, undefined, logger);

        expect(outcome.suggestedContact).toEqual(LUCAS);
        expect(directory.documentLookups).toEqual(['doc-1']);
    });

    it('con contexto de paso, sugiere al responsable del procedimiento', async () => {
        const directory = new FakeContactDirectory(ANA, { 'doc-1': LUCAS });
        const stepContext = {
            procedureVersionId: CONTEXT_VERSION,
            stepId: CONTEXT_STEP,
            procedureTitle: 'Cierre de caja',
            stepOrder: 3,
            stepTitle: 'Contar el efectivo',
            stepDescription: '',
        };

        const outcome = await resolveSuggestion(directory, noInfo, stepContext, logger);

        expect(outcome.suggestedContact).toEqual(ANA);
        expect(directory.documentLookups).toEqual([]);
    });

    it('con contexto de paso sin responsable, cae al del documento más cercano', async () => {
        const directory = new FakeContactDirectory(null, { 'doc-1': LUCAS });
        const stepContext = {
            procedureVersionId: CONTEXT_VERSION,
            stepId: CONTEXT_STEP,
            procedureTitle: 'Cierre de caja',
            stepOrder: 3,
            stepTitle: 'Contar el efectivo',
            stepDescription: '',
        };

        const outcome = await resolveSuggestion(directory, noInfo, stepContext, logger);

        expect(outcome.suggestedContact).toEqual(LUCAS);
    });

    it('si nadie tiene responsable, no agrega el campo', async () => {
        const outcome = await resolveSuggestion(new FakeContactDirectory(), noInfo, undefined, logger);

        expect(outcome).not.toHaveProperty('suggestedContact');
    });

    it('si la lectura falla, la respuesta sale igual y queda en el log', async () => {
        const warn = warnSpy();

        const outcome = await resolveSuggestion(new FakeContactDirectory(ANA, {}, true), noInfo, undefined, logger);

        expect(outcome).toBe(noInfo);
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('No se pudo buscar a quién consultar'));
    });
});

describe('HU19 · POST /api/chat (ChatService)', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('sin información, devuelve los documentos cercanos y el responsable, y no los cuenta como usados', async () => {
        const repo = new FakeRepository();
        const directory = new FakeContactDirectory(null, { 'doc-1': LUCAS });
        const service = new ChatService(
            new FakeEmbeddings(),
            new FakeRetrieval([chunk({ documentId: 'doc-1', documentTitle: 'Compras', distance: far })]),
            new FakeLlm(['no debería llamarse']),
            repo,
            undefined,
            undefined,
            directory,
        );

        const result = await service.ask(USER, { message: '¿plazo?' });

        expect(result.status).toBe('no_info');
        expect(result.sources).toEqual([]);
        expect(result.nearestDocuments).toEqual([{ documentId: 'doc-1', documentTitle: 'Compras' }]);
        expect(result.suggestedContact).toEqual(LUCAS);
        expect(repo.saved[0].usedChunkIds).toEqual([]);
    });

    it('una respuesta con fuentes no trae los campos de HU19', async () => {
        const service = new ChatService(
            new FakeEmbeddings(),
            new FakeRetrieval([chunk({ distance: 0.1 })]),
            new FakeLlm(['El plazo es 5 días [S1].']),
            new FakeRepository(),
            undefined,
            undefined,
            new FakeContactDirectory(ANA),
        );

        const result = await service.ask(USER, { message: '¿plazo?' });

        expect(result.status).toBe('answered');
        expect(result).not.toHaveProperty('nearestDocuments');
        expect(result).not.toHaveProperty('suggestedContact');
    });
});

describe('HU19 · POST /api/chat/stream (ChatStreamService)', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    async function streamNoInfo(opts: { context: boolean; directory: ContactDirectory }) {
        const service = new ChatStreamService(
            new FakeEmbeddings(),
            new FakeRetrieval([chunk({ documentId: 'doc-1', documentTitle: 'Compras', distance: far })]),
            new FakeLlm(['no debería llamarse']),
            new FakeRepository(),
            new FakeContextStore(stepRecord()),
            undefined,
            opts.directory,
        );
        const sink = new RecordingSink();
        const request = opts.context
            ? { message: '¿plazo?', context: { procedureVersionId: CONTEXT_VERSION, stepId: CONTEXT_STEP } }
            : { message: '¿plazo?' };
        const opened = await service.open(USER, request);
        await service.run(USER, opened, sink, new AbortController().signal);
        return sink;
    }

    it('sin contexto de paso, el done trae los cercanos y el responsable del documento', async () => {
        const sink = await streamNoInfo({
            context: false,
            directory: new FakeContactDirectory(null, { 'doc-1': LUCAS }),
        });

        expect(sink.names).toEqual(['start', 'done']);
        expect(sink.final).toMatchObject({
            status: 'no_info',
            nearestDocuments: [{ documentId: 'doc-1', documentTitle: 'Compras' }],
            suggestedContact: LUCAS,
            sources: [],
        });
    });

    it('con contexto de paso, sugiere al responsable del procedimiento', async () => {
        const sink = await streamNoInfo({
            context: true,
            directory: new FakeContactDirectory(ANA, { 'doc-1': LUCAS }),
        });

        expect(sink.final).toMatchObject({ status: 'no_info', suggestedContact: ANA });
    });
});