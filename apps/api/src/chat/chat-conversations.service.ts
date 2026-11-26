// Historial del asistente: listar, abrir y borrar conversaciones del usuario logueado.
import { Injectable, NotFoundException } from '@nestjs/common';
import {
    ChatConversationsRepository,
    type ConversationDetail,
    type ConversationSummary,
} from './ports/chat-conversations-repository';

const MAX_LIMIT = 100;

@Injectable()
export class ChatConversationsService {
    constructor(private readonly repository: ChatConversationsRepository) { }

    list(userId: string, limit: number): Promise<ConversationSummary[]> {
        const take = Math.min(Math.max(limit, 1), MAX_LIMIT);
        return this.repository.list(userId, take);
    }

    async get(userId: string, conversationId: string): Promise<ConversationDetail> {
        const conversation = await this.repository.findWithMessages(userId, conversationId);
        if (!conversation) throw new NotFoundException('Conversación no encontrada');
        return conversation;
    }

    async remove(userId: string, conversationId: string): Promise<void> {
        const removed = await this.repository.remove(userId, conversationId);
        if (!removed) throw new NotFoundException('Conversación no encontrada');
    }
}
