// Orquestación de una consulta al asistente (HU17), extraída de ChatService sin cambiar su
// comportamiento (spec 009, R14, D8) para que la usen POST /api/chat y POST /api/chat/stream.
// Las dependencias llegan por parámetro: ChatService sigue siendo el que las recibe por inyección.
import type { Logger } from '@nestjs/common';
import type { EmbeddingProvider } from '../processing/ports/embedding-provider';
import type { ChatResult, ChatResultStatus, ChatSource } from './chat.contract';
import type { LlmAnswer, Passage } from './ports/chat-llm';
import type { ChatRepository } from './ports/chat-repository';
import type { ChatRetrieval, RetrievedChunk } from './ports/chat-retrieval';

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

export interface Outcome {
    status: ChatResultStatus;
    answer: string;
    chunks: RetrievedChunk[];
    llm?: LlmAnswer;
}

// Lo que queda después de preparar: un resultado final (sin llamar al modelo) o los fragmentos
// relevantes y los pasajes para el modelo.
export type Prepared =
    | { kind: 'done'; outcome: Outcome }
    | { kind: 'ready'; chunks: RetrievedChunk[]; passages: Passage[] };

// Antes del modelo: áreas, embedding de la pregunta, recuperación con el umbral y pasajes S1, S2…
// Spec 010 (R8): searchText es el texto del embedding; con el paso, el título del paso y la pregunta.
export async function prepareChat(
    embeddings: EmbeddingProvider,
    retrieval: ChatRetrieval,
    user: ChatUser,
    question: string,
    logger: Logger,
    searchText: string = question,
): Promise<Prepared> {
    // Sin áreas asignadas no hay nada que el usuario pueda consultar.
    if (user.areaIds.length === 0) {
        return { kind: 'done', outcome: { status: 'no_info', answer: NO_INFO_TEXT, chunks: [] } };
    }

    let queryVector: number[];
    try {
        [queryVector] = await embeddings.embedMany([searchText]);
    } catch (error) {
        logger.warn(`Falló el embedding de la consulta: ${String(error)}`);
        return { kind: 'done', outcome: unavailable() };
    }

    const chunks = (await retrieval.search(queryVector, user.areaIds, TOP_K)).filter(
        (c) => c.distance <= MAX_COSINE_DISTANCE,
    );
    if (chunks.length === 0) {
        return { kind: 'done', outcome: { status: 'no_info', answer: NO_INFO_TEXT, chunks: [] } };
    }

    const passages: Passage[] = chunks.map((c, i) => ({
        ref: `S${i + 1}`,
        documentTitle: c.documentTitle,
        section: c.section,
        content: c.content,
    }));

    return { kind: 'ready', chunks, passages };
}

// Después del modelo: la marca NO_INFO o la respuesta con los fragmentos citados.
export function finishChat(llm: LlmAnswer, chunks: RetrievedChunk[]): Outcome {
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

// Guarda la consulta y arma la respuesta del Contrato 4. La latencia va desde startedAt hasta acá.
export async function saveResult(
    repository: ChatRepository,
    conversationId: string,
    question: string,
    outcome: Outcome,
    startedAt: number,
): Promise<ChatResult> {
    const usedChunks = outcome.chunks;

    const messageId = await repository.saveMessage({
        conversationId,
        question,
        answer: outcome.answer,
        status: outcome.status,
        usedChunkIds: usedChunks.map((c) => c.chunkId),
        usedVersionIds: [...new Set(usedChunks.map((c) => c.versionId))],
        modelName: outcome.llm?.modelName,
        latencyMs: Date.now() - startedAt,
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

export function unavailable(): Outcome {
    return { status: 'ai_unavailable', answer: UNAVAILABLE_TEXT, chunks: [] };
}

// Solo se devuelven como fuentes los fragmentos que el modelo citó con [S1], [S2], ...
// Si el modelo no citó ninguno, se devuelven todos los recuperados.
export function citedChunks(text: string, chunks: RetrievedChunk[]): RetrievedChunk[] {
    const cited = new Set<number>();
    for (const match of text.matchAll(/\[S(\d+)\]/g)) {
        cited.add(Number(match[1]));
    }
    const selected = chunks.filter((_, i) => cited.has(i + 1));
    return selected.length > 0 ? selected : chunks;
}

export function toSources(chunks: RetrievedChunk[]): ChatSource[] {
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
