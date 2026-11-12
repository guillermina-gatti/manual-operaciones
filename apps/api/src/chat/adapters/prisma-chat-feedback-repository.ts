// Persistencia de la valoración. Un mensaje tiene como máximo una valoración: si el usuario
// la cambia, se reemplaza la anterior.
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ChatFeedbackRepository, type FeedbackInput } from '../ports/chat-feedback-repository';

@Injectable()
export class PrismaChatFeedbackRepository extends ChatFeedbackRepository {
    constructor(private readonly prisma: PrismaService) {
        super();
    }

    async saveFeedback(userId: string, messageId: string, input: FeedbackInput): Promise<boolean> {
        const message = await this.prisma.message.findFirst({
            where: { id: messageId, conversation: { userId } },
            select: { id: true },
        });
        if (!message) return false;

        const data = { useful: input.useful, comment: input.comment ?? null };
        await this.prisma.messageFeedback.upsert({
            where: { messageId },
            create: { messageId, userId, ...data },
            update: data,
        });
        return true;
    }
}