// Orquesta una consulta al asistente (HU17): recuperar fragmentos vigentes del área del usuario,
// pedir una respuesta citada al modelo y devolver uno de los estados del Contrato 4.
// Spec 009 (T01): los pasos viven en chat-pipeline.ts, compartidos con POST /api/chat/stream.
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EmbeddingProvider } from '../processing/ports/embedding-provider';
import type { ChatRequest, ChatResult } from './chat.contract';
import {
    type ChatUser,
    type Outcome,
    finishChat,
    prepareChat,
    saveResult,
    unavailable,
} from './chat-pipeline';
import { ChatLlm, type LlmAnswer } from './ports/chat-llm';
import { ChatRepository } from './ports/chat-repository';
import { ChatRetrieval } from './ports/chat-retrieval';

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
    ) { }

    async ask(user: ChatUser, request: ChatRequest): Promise<ChatResult> {
        const started = Date.now();
        const question = request.message.trim();

        const conversationId = await this.repository.resolveConversation(user.id, request.conversationId, question);
        if (!conversationId) {
            throw new NotFoundException('Conversación no encontrada');
        }

        const outcome = await this.run(user, question);
        return saveResult(this.repository, conversationId, question, outcome, started);
    }

    private async run(user: ChatUser, question: string): Promise<Outcome> {
        const prepared = await prepareChat(this.embeddings, this.retrieval, user, question, this.logger);
        if (prepared.kind === 'done') {
            return prepared.outcome;
        }

        let llm: LlmAnswer;
        try {
            llm = await this.llm.answer(question, prepared.passages);
        } catch (error) {
            this.logger.warn(`Falló la llamada al modelo: ${String(error)}`);
            return unavailable();
        }

        return finishChat(llm, prepared.chunks);
    }
}
