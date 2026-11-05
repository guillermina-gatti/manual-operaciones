// Puerto de persistencia de conversaciones y consultas (tablas conversations y messages).
import type { ChatResultStatus } from '../chat.contract';

export interface SaveMessageInput {
    conversationId: string;
    question: string;
    answer: string;
    status: ChatResultStatus;
    usedChunkIds: string[];
    usedVersionIds: string[];
    modelName?: string;
    latencyMs: number;
    inputTokens?: number;
    outputTokens?: number;
}

export abstract class ChatRepository {
    // Devuelve el id de la conversación del usuario, o null si no le pertenece o no existe.
    // Sin conversationId crea una conversación nueva.
    abstract resolveConversation(userId: string, conversationId: string | undefined, title: string): Promise<string | null>;
    abstract saveMessage(input: SaveMessageInput): Promise<string>;
}