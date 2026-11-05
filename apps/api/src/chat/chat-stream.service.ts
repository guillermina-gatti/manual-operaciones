// Spec 009 (HU20, HU36): la consulta al asistente transmitida en partes. Usa la misma orquestación
// que ChatService (chat-pipeline.ts), así el resultado final es el mismo que POST /api/chat (R4).
import {
    Injectable,
    Logger,
    NotFoundException,
    Optional,
    ServiceUnavailableException,
} from '@nestjs/common';
import type { Role } from '../common/auth';
import { EmbeddingProvider } from '../processing/ports/embedding-provider';
import type { ChatRequest } from './chat.contract';
import {
    type ChatUser,
    NO_INFO_MARKER,
    type Outcome,
    UNAVAILABLE_TEXT,
    finishChat,
    prepareChat,
    saveResult,
    unavailable,
} from './chat-pipeline';
import { type StepContext, openStepContext, rememberConversationStep } from './chat-context';
import { CONFLICT_MARKER, checkMarkerLine, recordConflictAlert, splitMarkerLine, startsWithMarker } from './chat-conflict';
import { buildSearchUrl } from './chat-search-url';
import type { ChatEventSink } from './chat-stream.types';
import { ChatContextStore } from './ports/chat-context-store';
import { ChatLlm } from './ports/chat-llm';
import { ChatRepository } from './ports/chat-repository';
import { ChatRetrieval, type RetrievedChunk } from './ports/chat-retrieval';
import { ConflictAlertRecorder } from './ports/conflict-alert-recorder';

export const OPEN_UNAVAILABLE_MESSAGE = 'El asistente no está disponible en este momento';

// Tiempos de espera (R9, D12).
export const EMBEDDING_TIMEOUT_MS = 15_000; // embedding de la pregunta
export const FIRST_TEXT_TIMEOUT_MS = 15_000; // hasta la primera parte del modelo
export const IDLE_TIMEOUT_MS = 15_000; // entre una parte y la siguiente
export const TOTAL_TIMEOUT_MS = 60_000; // toda la generación

// Lo que deja open: la conversación, la pregunta y desde cuándo se mide la latencia.
export interface OpenedChat {
    conversationId: string;
    question: string;
    startedAt: number;
    // Spec 010: el paso desde el que se pregunta, ya validado; sin contexto, undefined.
    stepContext?: StepContext;
}

@Injectable()
export class ChatStreamService {
    private readonly logger = new Logger(ChatStreamService.name);

    constructor(
        private readonly embeddings: EmbeddingProvider,
        private readonly retrieval: ChatRetrieval,
        private readonly llm: ChatLlm,
        private readonly repository: ChatRepository,
        // Spec 010: para validar el contexto del paso. Opcional, así los tests de la spec 009 no cambian.
        @Optional() private readonly contextStore?: ChatContextStore,
        // Spec 011 (R12): registra la alerta de una contradicción. Opcional, como el anterior.
        @Optional() private readonly conflictAlerts?: ConflictAlertRecorder,
    ) { }

    // Antes de transmitir (R2): resolver la conversación. 404 si no es del usuario; cualquier otro
    // error, 503 (PD7). Los errores de acá salen como JSON, porque todavía no se abrió la transmisión.
    async open(user: ChatUser & { role?: Role }, request: ChatRequest): Promise<OpenedChat> {
        const startedAt = Date.now();
        const question = request.message.trim();

        // Spec 010 (R3 a R5, R7): el paso, antes de resolver la conversación (404, 400 o 503 en JSON).
        const stepContext = await openStepContext(this.contextStore, user, request);

        let conversationId: string | null;
        try {
            conversationId = await this.repository.resolveConversation(user.id, request.conversationId, question);
        } catch (error) {
            this.logger.error(`No se pudo resolver la conversación: ${String(error)}`);
            throw new ServiceUnavailableException(OPEN_UNAVAILABLE_MESSAGE);
        }
        if (!conversationId) {
            throw new NotFoundException('Conversación no encontrada');
        }
        await rememberConversationStep(this.contextStore, request, conversationId, stepContext);
        return { conversationId, question, startedAt, stepContext };
    }

    // Transmite: start, los delta y un solo evento final (done o error), R3. Si el cliente corta, no
    // se manda nada más ni se guarda (R11, D13).
    async run(user: ChatUser, opened: OpenedChat, sink: ChatEventSink, clientSignal: AbortSignal): Promise<void> {
        const { conversationId, question, startedAt, stepContext } = opened;
        sink.start({ conversationId });

        let outcome: Outcome;
        try {
            outcome = await this.answer(user, question, sink, clientSignal, stepContext);
        } catch (error) {
            if (clientSignal.aborted) return;
            // Lo que no es de la IA (por ejemplo, la base al recuperar): no hay done posible.
            this.logger.error(`Falló la consulta transmitida: ${String(error)}`);
            sink.error({ statusCode: 503, message: UNAVAILABLE_TEXT });
            return;
        }
        if (clientSignal.aborted) return;

        let result;
        try {
            result = await saveResult(this.repository, conversationId, question, outcome, startedAt);
        } catch (error) {
            this.logger.error(`No se pudo guardar la consulta: ${String(error)}`);
            sink.error({ statusCode: 503, message: UNAVAILABLE_TEXT });
            return;
        }
        // Spec 011 (R8, R12): con una contradicción, la alerta va antes de done. Si falla, solo el log.
        await recordConflictAlert(this.conflictAlerts, outcome, result, question, this.logger);

        sink.done(
            outcome.status === 'ai_unavailable' ? { ...result, searchUrl: buildSearchUrl(question) } : result,
        );
    }

    // Preparar, transmitir las partes del modelo con el retén de la marca y cerrar (plan 1.4). El
    // pedido al modelo se corta por cualquiera de los tiempos de R9 o si el cliente corta (PD4).
    private async answer(
        user: ChatUser,
        question: string,
        sink: ChatEventSink,
        clientSignal: AbortSignal,
        stepContext?: StepContext,
    ): Promise<Outcome> {
        const embeddings = withTimeout(this.embeddings, EMBEDDING_TIMEOUT_MS);
        // Spec 010 (R8): con el paso, el embedding usa su título y la pregunta.
        const searchText = stepContext ? `${stepContext.stepTitle}\n${question}` : question;
        const prepared = await prepareChat(embeddings, this.retrieval, user, question, this.logger, searchText);
        if (prepared.kind === 'done') {
            return prepared.outcome;
        }

        const controller = new AbortController();
        const cut = (reason: string) => () => controller.abort(new Error(reason));
        const onClientAbort = cut('El usuario cortó la consulta');
        if (clientSignal.aborted) onClientAbort();
        clientSignal.addEventListener('abort', onClientAbort);
        let idle = setTimeout(cut('El modelo no empezó a responder a tiempo'), FIRST_TEXT_TIMEOUT_MS);
        const total = setTimeout(cut('El modelo superó el tiempo total'), TOTAL_TIMEOUT_MS);

        const gate = new MarkerGate(prepared.chunks, (text) => {
            if (!clientSignal.aborted) sink.delta({ text });
        });
        try {
            const stream = this.llm.stream(question, prepared.passages, controller.signal, stepContext);
            for await (const part of stream.textStream) {
                clearTimeout(idle);
                idle = setTimeout(cut('El modelo dejó de responder'), IDLE_TIMEOUT_MS);
                gate.push(part);
            }
            const llm = await stream.final;
            gate.end();
            return finishChat(llm, prepared.chunks, this.logger);
        } catch (error) {
            if (!clientSignal.aborted) this.logger.warn(`Falló la llamada al modelo: ${String(error)}`);
            return unavailable();
        } finally {
            clearTimeout(idle);
            clearTimeout(total);
            clientSignal.removeEventListener('abort', onClientAbort);
            controller.abort();
        }
    }
}

// R9: el embedding de la pregunta con un límite de tiempo, sin cambiar el EmbeddingProvider de
// procesamiento (PD5). Si se pasa, falla como un embedding caído (ai_unavailable).
function withTimeout(embeddings: EmbeddingProvider, ms: number): EmbeddingProvider {
    return {
        embedMany(texts: string[]): Promise<number[][]> {
            let timer: ReturnType<typeof setTimeout> | undefined;
            const expired = new Promise<never>((_, reject) => {
                timer = setTimeout(() => reject(new Error('El embedding superó el tiempo de espera')), ms);
            });
            return Promise.race([embeddings.embedMany(texts), expired]).finally(() => clearTimeout(timer));
        },
    };
}

// R6: no deja salir texto hasta saber que la respuesta no empieza con la marca NO_INFO.
// Spec 011 (R8, D9; plan 011, PD3): tampoco con la marca CONFLICT. Espera como antes (hasta tener
// tantos caracteres como NO_INFO), y además mientras lo que llegó pueda ser CONFLICT o, si empieza con
// la marca, hasta el fin de su línea. Una línea válida cierra el retén (conflict no manda delta); una
// inválida lo abre con el texto que la sigue, que es el answer que arma finishChat (R6).
class MarkerGate {
    private buffer = '';
    private state: 'waiting' | 'open' | 'closed' = 'waiting';

    constructor(
        private readonly chunks: RetrievedChunk[],
        private readonly emit: (text: string) => void,
    ) { }

    push(part: string): void {
        if (this.state === 'open') {
            if (part) this.emit(part);
            return;
        }
        if (this.state === 'closed') return;

        this.buffer += part;
        const text = this.buffer.trimStart();
        if (this.mayStillBeAMarker(text)) return;
        this.decide(text);
    }

    // Al terminar el modelo: lo que quedó retenido sale, salvo que sea una marca.
    end(): void {
        if (this.state !== 'waiting') return;
        const text = this.buffer.trimStart();
        if (text) this.decide(text);
    }

    private mayStillBeAMarker(text: string): boolean {
        if (text.length < NO_INFO_MARKER.length) return true;
        if (CONFLICT_MARKER.startsWith(text)) return true;
        return startsWithMarker(text) && !splitMarkerLine(text).complete;
    }

    private decide(text: string): void {
        if (text.startsWith(NO_INFO_MARKER)) {
            this.state = 'closed';
            return;
        }
        if (startsWithMarker(text)) {
            const { line, rest } = splitMarkerLine(text);
            if (checkMarkerLine(line, this.chunks).ok) {
                this.state = 'closed';
                return;
            }
            this.state = 'open';
            const body = rest.trimStart();
            if (body) this.emit(body);
            return;
        }
        this.state = 'open';
        this.emit(text);
    }
}
