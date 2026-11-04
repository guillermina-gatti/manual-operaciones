// Orquesta una consulta al asistente (HU17): recuperar fragmentos vigentes del área del usuario,
// pedir una respuesta citada al modelo y devolver uno de los estados del Contrato 4.
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EmbeddingProvider } from '../processing/ports/embedding-provider';
import type { ChatRequest, ChatResult, ChatResultStatus, ChatSource } from './chat.contract';
import { ChatLlm, type LlmAnswer, type Passage } from './ports/chat-llm';
import { ChatRepository } from './ports/chat-repository';
import { ChatRetrieval, type RetrievedChunk } from './ports/chat-retrieval';

export const TOP_K = 6;
// Distancia coseno máxima para considerar un fragmento relevante. Ajustar con documentos reales.
export const MAX_COSINE_DISTANCE = 0.45;
export const NO_INFO_MARKER = 'NO_INFO';

export const NO_INFO_TEXT =
    'No encontré información suficiente en los documentos vigentes a los que tenés acceso para responder esta consulta.';
export const UNAVAILABLE_TEXT =
    'El asistente no está disponible en este momento. Podés buscar directamente en los documentos.';

export interface ChatUser {
    id: string;
    areaIds: string[];
}

interface Outcome {
    status: ChatResultStatus;
    answer: string;
    chunks: RetrievedChunk[];
    llm?: LlmAnswer;
}

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
        const usedChunks = outcome.chunks;

        const messageId = await this.repository.saveMessage({
            conversationId,
            question,
            answer: outcome.answer,
            status: outcome.status,
            usedChunkIds: usedChunks.map((c) => c.chunkId),
            usedVersionIds: [...new Set(usedChunks.map((c) => c.versionId))],
            modelName: outcome.llm?.modelName,
            latencyMs: Date.now() - started,
            inputTokens: outcome.llm?.inputTokens,
            outputTokens: outcome.llm?.outputTokens,
        });

        return {
            conversationId,
            messageId,
            status: outcome.status,
            answer: outcome.answer,
            sources: toSources(usedChunks),
        };
    }

    private async run(user: ChatUser, question: string): Promise<Outcome> {
        // Sin áreas asignadas no hay nada que el usuario pueda consultar.
        if (user.areaIds.length === 0) {
            return { status: 'no_info', answer: NO_INFO_TEXT, chunks: [] };
        }

        let queryVector: number[];
        try {
            [queryVector] = await this.embeddings.embedMany([question]);
        } catch (error) {
            this.logger.warn(`Falló el embedding de la consulta: ${String(error)}`);
            return unavailable();
        }

        const chunks = (await this.retrieval.search(queryVector, user.areaIds, TOP_K)).filter(
            (c) => c.distance <= MAX_COSINE_DISTANCE,
        );
        if (chunks.length === 0) {
            return { status: 'no_info', answer: NO_INFO_TEXT, chunks: [] };
        }

        const passages: Passage[] = chunks.map((c, i) => ({
            ref: `S${i + 1}`,
            documentTitle: c.documentTitle,
            section: c.section,
            content: c.content,
        }));

        let llm: LlmAnswer;
        try {
            llm = await this.llm.answer(question, passages);
        } catch (error) {
            this.logger.warn(`Falló la llamada al modelo: ${String(error)}`);
            return unavailable();
        }

        if (llm.text.startsWith(NO_INFO_MARKER)) {
            return { status: 'no_info', answer: NO_INFO_TEXT, chunks: [], llm };
        }

        return {
            status: 'answered',
            answer: llm.text,
            chunks: citedChunks(llm.text, chunks),
            llm,
        };
    }
}

function unavailable(): Outcome {
    return { status: 'ai_unavailable', answer: UNAVAILABLE_TEXT, chunks: [] };
}

// Solo se devuelven como fuentes los fragmentos que el modelo citó con [S1], [S2], ...
// Si el modelo no citó ninguno, se devuelven todos los recuperados.
function citedChunks(text: string, chunks: RetrievedChunk[]): RetrievedChunk[] {
    const cited = new Set<number>();
    for (const match of text.matchAll(/\[S(\d+)\]/g)) {
        cited.add(Number(match[1]));
    }
    const selected = chunks.filter((_, i) => cited.has(i + 1));
    return selected.length > 0 ? selected : chunks;
}

function toSources(chunks: RetrievedChunk[]): ChatSource[] {
    return chunks.map((c) => ({
        documentId: c.documentId,
        documentTitle: c.documentTitle,
        versionNumber: c.versionNumber,
        section: c.section ?? 'Sin sección',
        chunkId: c.chunkId,
        validFrom: c.validFrom,
        // TODO HU18: reemplazar por el enlace firmado al pasaje.
        url: '',
    }));
}