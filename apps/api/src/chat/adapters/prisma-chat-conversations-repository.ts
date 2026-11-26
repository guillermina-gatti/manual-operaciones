// Historial de conversaciones con Prisma. Las consultas siempre filtran por userId.
import { Injectable } from '@nestjs/common';
import type { ChatResultStatus } from '../chat.contract';
import { PrismaService } from '../../prisma/prisma.service';
import {
    ChatConversationsRepository,
    type ConversationDetail,
    type ConversationSummary,
} from '../ports/chat-conversations-repository';

// Valores del enum ChatStatus de Prisma, al revés que en PrismaChatRepository.
const FROM_STATUS: Record<'ANSWERED' | 'NO_INFO' | 'CONFLICT' | 'AI_UNAVAILABLE', ChatResultStatus> = {
    ANSWERED: 'answered',
    NO_INFO: 'no_info',
    CONFLICT: 'conflict',
    AI_UNAVAILABLE: 'ai_unavailable',
};

@Injectable()
export class PrismaChatConversationsRepository extends ChatConversationsRepository {
    constructor(private readonly prisma: PrismaService) {
        super();
    }

    async list(userId: string, take: number): Promise<ConversationSummary[]> {
        return this.prisma.conversation.findMany({
            where: { userId },
            orderBy: { updatedAt: 'desc' },
            take,
            select: { id: true, title: true, createdAt: true, updatedAt: true },
        });
    }

    async findWithMessages(userId: string, conversationId: string): Promise<ConversationDetail | null> {
        const row = await this.prisma.conversation.findFirst({
            where: { id: conversationId, userId },
            select: {
                id: true,
                title: true,
                createdAt: true,
                updatedAt: true,
                messages: {
                    orderBy: { createdAt: 'asc' },
                    select: { id: true, question: true, answer: true, status: true, createdAt: true },
                },
            },
        });
        if (!row) return null;

        return {
            id: row.id,
            title: row.title,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
            messages: row.messages.map((message) => ({
                id: message.id,
                question: message.question,
                answer: message.answer,
                status: FROM_STATUS[message.status],
                createdAt: message.createdAt,
            })),
        };
    }

    async remove(userId: string, conversationId: string): Promise<boolean> {
        // Los mensajes y su feedback se borran en cascada (onDelete: Cascade en el esquema).
        const { count } = await this.prisma.conversation.deleteMany({
            where: { id: conversationId, userId },
        });
        return count > 0;
    }
}
