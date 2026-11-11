// Simulados del chat para los tests de la spec 009. Son copias de los de chat.service.spec.ts (de
// Guille), que no se importan para no tocar su archivo, más un modelo que transmite en partes.
import { EmbeddingProvider } from '../../processing/ports/embedding-provider';
import type { ChatStreamDone, ChatStreamErrorBody, ChatEventSink } from '../chat-stream.types';
import type { StepContext, StepRecord } from '../chat-context';
import { ChatContextStore, type ConversationStep } from '../ports/chat-context-store';
import { ChatLlm, type LlmAnswer, type LlmStream, type Passage } from '../ports/chat-llm';
import { ChatRepository, type SaveMessageInput } from '../ports/chat-repository';
import { ChatRetrieval, type RetrievedChunk } from '../ports/chat-retrieval';
import { ConflictAlertRecorder, type ConflictAlertInput } from '../ports/conflict-alert-recorder';

export const USER = { id: 'user-1', areaIds: ['area-1'] };

export function chunk(overrides: Partial<RetrievedChunk> = {}): RetrievedChunk {
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

export class FakeEmbeddings extends EmbeddingProvider {
    calls = 0;
    texts: string[][] = []; // spec 010: con qué texto se pidió cada embedding
    // fail: rechaza; hang: no responde nunca (para los tiempos de espera).
    constructor(private readonly mode: 'ok' | 'fail' | 'hang' = 'ok') {
        super();
    }
    async embedMany(texts: string[]): Promise<number[][]> {
        this.calls++;
        this.texts.push(texts);
        if (this.mode === 'fail') throw new Error('embedding down');
        if (this.mode === 'hang') return new Promise(() => undefined);
        return texts.map(() => [0.1, 0.2, 0.3]);
    }
}

export class FakeRetrieval extends ChatRetrieval {
    calls = 0;
    constructor(private readonly rows: RetrievedChunk[]) {
        super();
    }
    async search(): Promise<RetrievedChunk[]> {
        this.calls++;
        return this.rows;
    }
}

// Un paso del modelo simulado: una parte de texto, una espera, o un fallo.
export type LlmStep = string | { wait: number } | { fail: string } | { hang: true };

// answer responde todo junto; stream entrega cada paso, respetando la señal.
export class FakeLlm extends ChatLlm {
    lastPassages: Passage[] = [];
    signals: AbortSignal[] = [];
    contexts: Array<StepContext | undefined> = []; // spec 010: el contexto de cada llamada
    constructor(private readonly steps: LlmStep[] | null) {
        super();
    }

    private get text(): string {
        return (this.steps ?? []).filter((s): s is string => typeof s === 'string').join('').trim();
    }

    private get failure(): string | undefined {
        const step = (this.steps ?? []).find((s) => typeof s === 'object' && 'fail' in s);
        return step && typeof step === 'object' && 'fail' in step ? step.fail : undefined;
    }

    async answer(_question: string, passages: Passage[], context?: StepContext): Promise<LlmAnswer> {
        this.lastPassages = passages;
        this.contexts.push(context);
        if (this.steps === null) throw new Error('model down');
        if (this.failure) throw new Error(this.failure);
        return { text: this.text, modelName: 'fake-model', inputTokens: 10, outputTokens: 5 };
    }

    stream(_question: string, passages: Passage[], signal: AbortSignal, context?: StepContext): LlmStream {
        this.lastPassages = passages;
        this.contexts.push(context);
        this.signals.push(signal);
        const steps = this.steps;
        let text = '';
        let resolveFinal!: (answer: LlmAnswer) => void;
        let rejectFinal!: (error: unknown) => void;
        const final = new Promise<LlmAnswer>((resolve, reject) => {
            resolveFinal = resolve;
            rejectFinal = reject;
        });
        final.catch(() => undefined);

        const aborted = () =>
            new Promise<never>((_, reject) => {
                if (signal.aborted) reject(new Error('Pedido cortado'));
                signal.addEventListener('abort', () => reject(new Error('Pedido cortado')), { once: true });
            });

        async function* parts(): AsyncGenerator<string> {
            try {
                if (steps === null) throw new Error('model down');
                for (const step of steps) {
                    if (signal.aborted) throw new Error('Pedido cortado');
                    if (typeof step === 'string') {
                        text += step;
                        yield step;
                    } else if ('wait' in step) {
                        await Promise.race([new Promise((r) => setTimeout(r, step.wait)), aborted()]);
                    } else if ('hang' in step) {
                        await aborted();
                    } else {
                        throw new Error(step.fail);
                    }
                }
                resolveFinal({ text: text.trim(), modelName: 'fake-model', inputTokens: 10, outputTokens: 5 });
            } catch (error) {
                rejectFinal(error);
                throw error;
            }
        }

        return { textStream: parts(), final };
    }
}

export class FakeRepository extends ChatRepository {
    saved: SaveMessageInput[] = [];
    failSave = false;
    failResolve = false;
    constructor(private readonly owned: string[] = []) {
        super();
    }
    async resolveConversation(_userId: string, conversationId: string | undefined): Promise<string | null> {
        if (this.failResolve) throw new Error('db down');
        if (!conversationId) return 'conv-new';
        return this.owned.includes(conversationId) ? conversationId : null;
    }
    async saveMessage(input: SaveMessageInput): Promise<string> {
        if (this.failSave) throw new Error('db down');
        this.saved.push(input);
        return 'msg-1';
    }
}

export type RecordedEvent =
    | { event: 'start'; data: { conversationId: string } }
    | { event: 'delta'; data: { text: string } }
    | { event: 'done'; data: ChatStreamDone }
    | { event: 'error'; data: ChatStreamErrorBody };

export class RecordingSink implements ChatEventSink {
    events: RecordedEvent[] = [];
    start(data: { conversationId: string }): void {
        this.events.push({ event: 'start', data });
    }
    delta(data: { text: string }): void {
        this.events.push({ event: 'delta', data });
    }
    done(data: ChatStreamDone): void {
        this.events.push({ event: 'done', data });
    }
    error(data: ChatStreamErrorBody): void {
        this.events.push({ event: 'error', data });
    }

    get names(): string[] {
        return this.events.map((e) => e.event);
    }

    get deltas(): string[] {
        return this.events.flatMap((e) => (e.event === 'delta' ? [e.data.text] : []));
    }

    get final(): ChatStreamDone | undefined {
        const last = this.events.find((e) => e.event === 'done');
        return last?.event === 'done' ? last.data : undefined;
    }
}

// --- Spec 010: el contexto del paso ------------------------------------------------------------------

export const CONTEXT_VERSION = '0e000000-0000-4000-8000-000000000002';
export const CONTEXT_STEP = '0f000000-0000-4000-8000-000000000003';

// Un paso 3 "Contar el efectivo" de la versión vigente de un procedimiento del área de USER.
export function stepRecord(overrides: { description?: string; areaIds?: string[] } = {}): StepRecord {
    return {
        version: { id: CONTEXT_VERSION, procedureId: 'procedure-1', versionNumber: 2, status: 'PUBLISHED', title: 'Cierre de caja' },
        step: {
            id: CONTEXT_STEP,
            procedureVersionId: CONTEXT_VERSION,
            stepOrder: 3,
            title: 'Contar el efectivo',
            description: overrides.description ?? 'Contá billetes y monedas.',
        },
        procedureAreaIds: overrides.areaIds ?? USER.areaIds,
        versions: [{ versionNumber: 2, status: 'PUBLISHED', stepCount: 4 }],
    };
}

export class FakeContextStore extends ChatContextStore {
    saved: Array<{ conversationId: string; step: ConversationStep }> = [];
    constructor(
        private readonly record: StepRecord | null = stepRecord(),
        private readonly conversations: Record<string, ConversationStep | null> = {},
    ) {
        super();
    }
    async findStep(): Promise<StepRecord | null> {
        return this.record;
    }
    async hasInProgressExecution(): Promise<boolean> {
        return false;
    }
    async findConversationStep(_userId: string, conversationId: string): Promise<ConversationStep | null | undefined> {
        return conversationId in this.conversations ? this.conversations[conversationId] : undefined;
    }
    async setConversationStep(conversationId: string, step: ConversationStep): Promise<void> {
        this.saved.push({ conversationId, step });
    }
}

// --- Spec 011: las alertas de contradicción ----------------------------------------------------------

// Guarda lo que recibe; con failure, rechaza (R12).
export class FakeConflictAlertRecorder extends ConflictAlertRecorder {
    recorded: ConflictAlertInput[] = [];
    failure: Error | null = null;
    async record(input: ConflictAlertInput): Promise<void> {
        if (this.failure) throw this.failure;
        this.recorded.push(input);
    }
}