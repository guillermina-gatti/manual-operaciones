// Orquesta una consulta al asistente (HU17): recuperar fragmentos vigentes del área del usuario,
// pedir una respuesta citada al modelo y devolver uno de los estados del Contrato 4.
// Spec 009 (T01): los pasos viven en chat-pipeline.ts, compartidos con POST /api/chat/stream.
import { Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import type { Role } from '../common/auth';
import { EmbeddingProvider } from '../processing/ports/embedding-provider';
import type { ChatRequest, ChatResult } from './chat.contract';
import { recordConflictAlert } from './chat-conflict';
import { type StepContext, openStepContext, rememberConversationStep } from './chat-context';
import {
    type ChatUser,
    type Outcome,
    finishChat,
    prepareChat,
    saveResult,
    unavailable,
} from './chat-pipeline';
import { ChatContextStore } from './ports/chat-context-store';
import { ChatLlm, type LlmAnswer } from './ports/chat-llm';
import { ChatRepository } from './ports/chat-repository';
import { ChatRetrieval } from './ports/chat-retrieval';
import { ConflictAlertRecorder } from './ports/conflict-alert-recorder';

// Se siguen exportando desde acá, como antes de la extracción.
export {
    MAX_COSINE_DISTANCE,
    NO_INFO_MARKER,
    NO_INFO_TEXT,
    TOP_K,
    UNAVAILABLE_TEXT,
} from './chat-pipeline';
export type { ChatUser } from './chat-pipeline';

@Injectable()
export class ChatService {
    private readonly logger = new Logger(ChatService.name);

    constructor(
        private readonly embeddings: EmbeddingProvider,
        private readonly retrieval: ChatRetrieval,
        private readonly llm: ChatLlm,
        private readonly repository: ChatRepository,
        // Spec 010: para validar el contexto del paso. Opcional: sin él, todo sigue como antes.
        @Optional() private readonly contextStore?: ChatContextStore,
        // Spec 011: para registrar la alerta de una contradicción. Opcional: sin él, todo sigue como antes.
        @Optional() private readonly conflictAlerts?: ConflictAlertRecorder,
    ) { }

    async ask(user: ChatUser & { role?: Role }, request: ChatRequest): Promise<ChatResult> {
        const started = Date.now();
        const question = request.message.trim();
        // Spec 010: el paso, como en POST /api/chat/stream. Sin contexto, no hace nada.
        const stepContext = await openStepContext(this.contextStore, user, request);

        const conversationId = await this.repository.resolveConversation(user.id, request.conversationId, question);
        if (!conversationId) {
            throw new NotFoundException('Conversación no encontrada');
        }
        await rememberConversationStep(this.contextStore, request, conversationId, stepContext);

        const outcome = await this.run(user, question, stepContext);
        const result = await saveResult(this.repository, conversationId, question, outcome, started);
        // Spec 011: con una contradicción, la alerta al ADMIN. Sin ella, no hace nada.
        await recordConflictAlert(this.conflictAlerts, outcome, result, question, this.logger);
        return result;
    }

    private async run(user: ChatUser, question: string, stepContext?: StepContext): Promise<Outcome> {
        const searchText = stepContext ? `${stepContext.stepTitle}\n${question}` : question;
        const prepared = await prepareChat(this.embeddings, this.retrieval, user, question, this.logger, searchText);
        if (prepared.kind === 'done') {
            return prepared.outcome;
        }

        let llm: LlmAnswer;
        try {
            llm = await this.llm.answer(question, prepared.passages, stepContext);
        } catch (error) {
            this.logger.warn(`Falló la llamada al modelo: ${String(error)}`);
            return unavailable();
        }

        return finishChat(llm, prepared.chunks, this.logger);
    }
}
