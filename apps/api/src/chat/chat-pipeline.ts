// Orquestación de una consulta al asistente (HU17), extraída de ChatService sin cambiar su
// comportamiento (spec 009, R14, D8) para que la usen POST /api/chat y POST /api/chat/stream.
// Las dependencias llegan por parámetro: ChatService sigue siendo el que las recibe por inyección.
import type { Logger } from '@nestjs/common';
import type { EmbeddingProvider } from '../processing/ports/embedding-provider';
import type { ChatResult, ChatResultStatus, ChatSource, NearestDocument } from './chat.contract';
import { keepOnlyRefs, readConflictMarker, refsOf } from './chat-conflict';
import { platformHelpReply } from './chat-help';
import { smallTalkReply } from './chat-greeting';
import type { ContactPerson } from './ports/contact-directory';
import type { LlmAnswer, Passage } from './ports/chat-llm';
import type { ChatRepository } from './ports/chat-repository';
import type { ChatRetrieval, RetrievedChunk } from './ports/chat-retrieval';

export const TOP_K = 6;
// Distancia coseno máxima para considerar un fragmento relevante. Ajustar con documentos reales.
export const MAX_COSINE_DISTANCE = 0.45;
// HU19: cuántos documentos cercanos se muestran cuando no hay información suficiente.
export const NEAREST_DOCUMENTS_LIMIT = 3;
export const NO_INFO_MARKER = 'NO_INFO';

export const NO_INFO_TEXT =
    'No encontré información suficiente en los documentos vigentes a los que tenés acceso para responder esta consulta.';
export const UNAVAILABLE_TEXT =
    'El asistente no está disponible en este momento. Podés buscar directamente en los documentos.';

export interface ChatUser {
    id: string;
    areaIds: string[];
    // Rol del usuario. El ADMIN busca en todos los documentos vigentes, no solo en sus áreas (pedido de Mati).
    role?: string;
}

export interface Outcome {
    status: ChatResultStatus;
    answer: string;
    chunks: RetrievedChunk[];
    llm?: LlmAnswer;
    // Spec 011 (R7): solo con status conflict, los dos fragmentos de la contradicción (first, el de
    // número de pasaje menor). Son también los de chunks.
    conflict?: { first: RetrievedChunk; second: RetrievedChunk };
    // HU19: solo con no_info. Los documentos más cercanos; no están en chunks, así que no cuentan
    // como usados ni como fuentes.
    nearest?: NearestDocument[];
    // HU19: solo con no_info. Lo pone resolveSuggestion (chat-contact.ts), después de la búsqueda.
    suggestedContact?: ContactPerson;
}

// HU19: los documentos distintos de los fragmentos más cercanos, en orden de cercanía. Sin
// documentos, no hay campo (el resultado queda como antes de HU19).
export function nearestOf(chunks: RetrievedChunk[]): { nearest?: NearestDocument[] } {
    const byDocument = new Map<string, NearestDocument>();
    for (const c of chunks) {
        if (!byDocument.has(c.documentId)) {
            byDocument.set(c.documentId, { documentId: c.documentId, documentTitle: c.documentTitle });
        }
        if (byDocument.size === NEAREST_DOCUMENTS_LIMIT) break;
    }
    const nearest = [...byDocument.values()];
    return nearest.length > 0 ? { nearest } : {};
}

// Lo que queda después de preparar: un resultado final (sin llamar al modelo) o los fragmentos
// relevantes y los pasajes para el modelo.
export type Prepared =
    | { kind: 'done'; outcome: Outcome }
    | { kind: 'ready'; chunks: RetrievedChunk[]; passages: Passage[] };

// Antes del modelo: áreas, charla, embedding de la pregunta, recuperación con el umbral y pasajes S1, S2…
// Spec 010 (R8): searchText es el texto del embedding; con el paso, el título del paso y la pregunta.
export async function prepareChat(
    embeddings: EmbeddingProvider,
    retrieval: ChatRetrieval,
    user: ChatUser,
    question: string,
    logger: Logger,
    searchText: string = question,
): Promise<Prepared> {
    // Alcance de la búsqueda: null = todos los documentos vigentes (solo ADMIN); si no, sus áreas.
    const scope: string[] | null = user.role === 'ADMIN' ? null : user.areaIds;
    // Sin áreas asignadas no hay nada que el usuario pueda consultar, ni siquiera un saludo.
    if (scope !== null && scope.length === 0) {
        return { kind: 'done', outcome: { status: 'no_info', answer: NO_INFO_TEXT, chunks: [] } };
    }

    // Charla básica (saludos, despedidas, agradecimientos y preguntas sobre el asistente): respuesta
    // fija, sin buscar ni llamar al modelo. El estado sigue siendo answered y sin fuentes.
    const reply = smallTalkReply(question);
    if (reply !== null) {
        return { kind: 'done', outcome: { status: 'answered', answer: reply, chunks: [] } };
    }

    // Ayuda de la plataforma ("¿cómo veo un documento?"): texto fijo, sin buscar ni llamar al modelo.
    const help = platformHelpReply(question);
    if (help !== null) {
        return { kind: 'done', outcome: { status: 'answered', answer: help, chunks: [] } };
    }

    let queryVector: number[];
    try {
        [queryVector] = await embeddings.embedMany([searchText]);
    } catch (error) {
        logger.warn(`Falló el embedding de la consulta: ${String(error)}`);
        return { kind: 'done', outcome: unavailable() };
    }

    const retrieved = await retrieval.search(queryVector, scope, TOP_K);
    const chunks = retrieved.filter((c) => c.distance <= MAX_COSINE_DISTANCE);
    if (chunks.length === 0) {
        // HU19: los más cercanos, aunque estén fuera del umbral, para mostrar dónde buscar.
        return {
            kind: 'done',
            outcome: { status: 'no_info', answer: NO_INFO_TEXT, chunks: [], ...nearestOf(retrieved) },
        };
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
// Spec 011 (R5 a R7): después de NO_INFO, la marca CONFLICT. Sin ella, exactamente lo de antes. El
// logger es opcional (plan 011, PD2): anota una marca inválida, que se trata como answered.
export function finishChat(llm: LlmAnswer, chunks: RetrievedChunk[], logger?: Pick<Logger, 'warn'>): Outcome {
    if (llm.text.startsWith(NO_INFO_MARKER)) {
        return { status: 'no_info', answer: NO_INFO_TEXT, chunks: [], llm, ...nearestOf(chunks) };
    }

    const marker = readConflictMarker(llm.text, chunks);
    if (marker.kind === 'conflict') {
        const { first, second, body } = marker;
        return {
            status: 'conflict',
            answer: keepOnlyRefs(body, refsOf(marker, chunks)),
            chunks: [first, second],
            conflict: { first, second },
            llm,
        };
    }
    let text = llm.text;
    if (marker.kind === 'invalid') {
        logger?.warn(`Marca de contradicción inválida, se responde sin ella: ${marker.reason}`);
        if (!marker.body) return { status: 'no_info', answer: NO_INFO_TEXT, chunks: [], llm, ...nearestOf(chunks) };
        text = marker.body;
    }

    // Sin ninguna cita válida, no hay respuesta que mostrar: no_info (pedido de Mati).
    const cleaned = cleanCitations(text, chunks.length);
    if (cleaned.refs.size === 0) {
        return { status: 'no_info', answer: NO_INFO_TEXT, chunks: [], llm, ...nearestOf(chunks) };
    }

    return {
        status: 'answered',
        answer: cleaned.text,
        chunks: citedChunks(cleaned.text, chunks),
        llm,
    };
}

// Quita las citas que no corresponden a un fragmento recuperado (por ejemplo [S7] con 3 fragmentos),
// para que el done traiga la respuesta limpia. Devuelve las citas válidas que quedan.
export function cleanCitations(text: string, count: number): { text: string; refs: Set<number> } {
    const refs = new Set<number>();
    const cleaned = text.replace(/\s*\[S(\d+)\]/g, (match, n: string) => {
        const index = Number(n);
        if (index >= 1 && index <= count) {
            refs.add(index);
            return match;
        }
        return '';
    });
    return { text: cleaned.trim(), refs };
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
        ...(outcome.nearest ? { nearestDocuments: outcome.nearest } : {}),
        ...(outcome.suggestedContact ? { suggestedContact: outcome.suggestedContact } : {}),
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
        // HU18: el enlace firmado lo pone withSignedLinks (chat-links.ts); sin él, queda vacío.
        url: c.url ?? '',
    }));
}