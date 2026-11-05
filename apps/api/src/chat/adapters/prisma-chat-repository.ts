// Persistencia del chat con Prisma (tablas conversations y messages, creadas en add_chat).
import { Injectable } from '@nestjs/common';
import type { ChatResultStatus } from '../chat.contract';
import { PrismaService } from '../../prisma/prisma.service';
import { ChatRepository, type SaveMessageInput } from '../ports/chat-repository';

// Valores del enum ChatStatus de Prisma.
const STATUS_MAP: Record<ChatResultStatus, 'ANSWERED' | 'NO_INFO' | 'CONFLICT' | 'AI_UNAVAILABLE'> = {
    answered: 'ANSWERED',
    no_info: 'NO_INFO',
    conflict: 'CONFLICT',
    ai_unavailable: 'AI_UNAVAILABLE',
};

@Injectable()
export class PrismaChatRepository extends ChatRepository {
    constructor(private readonly prisma: PrismaService) {
        super();
    }

    async resolveConversation(userId: string, conversationId: string | undefined, title: string): Promise<string | null> {
        if (conversationId) {
            const found = await this.prisma.conversation.findFirst({
                where: { id: conversationId, userId },
                select: { id: true },
            });
            return found?.id ?? null;
        }
        const created = await this.prisma.conversation.create({
            data: { userId, title: title.slice(0, 200) },
            select: { id: true },
        });
        return created.id;
    }

    async saveMessage(input: SaveMessageInput): Promise<string> {
        const message = await this.prisma.message.create({
            data: {
                conversationId: input.conversationId,
                question: input.question,
                answer: input.answer,
                status: STATUS_MAP[input.status],
                usedChunkIds: input.usedChunkIds,
                usedVersionIds: input.usedVersionIds,
                modelName: input.modelName,
                latencyMs: input.latencyMs,
                inputTokens: input.inputTokens,
                outputTokens: input.outputTokens,
            },
            select: { id: true },
        });
        return message.id;
    }
}