// Puerto de lectura y borrado del historial de conversaciones del usuario.
import type { ChatResultStatus } from '../chat.contract';

export interface ConversationSummary {
    id: string;
    title: string | null;
    createdAt: Date;
    updatedAt: Date;
}

export interface ConversationMessage {
    id: string;
    question: string;
    answer: string | null;
    status: ChatResultStatus;
    createdAt: Date;
}

export interface ConversationDetail extends ConversationSummary {
    messages: ConversationMessage[];
}

export abstract class ChatConversationsRepository {
    // Siempre filtra por userId: nadie ve ni borra conversaciones ajenas.
    abstract list(userId: string, take: number): Promise<ConversationSummary[]>;
    abstract findWithMessages(userId: string, conversationId: string): Promise<ConversationDetail | null>;
    // Devuelve false si la conversación no existe o no es del usuario.
    abstract remove(userId: string, conversationId: string): Promise<boolean>;
}
