// Registra si una respuesta fue útil (HU25). Solo valora el usuario que hizo la consulta.
import { Injectable, NotFoundException } from '@nestjs/common';
import type { ChatFeedbackRequest } from './chat.contract';
import { ChatFeedbackRepository } from './ports/chat-feedback-repository';

@Injectable()
export class ChatFeedbackService {
    constructor(private readonly repository: ChatFeedbackRepository) { }

    async record(userId: string, messageId: string, request: ChatFeedbackRequest): Promise<void> {
        // Un comentario vacío o solo con espacios se guarda como ausente.
        const comment = request.comment?.trim() || undefined;

        const saved = await this.repository.saveFeedback(userId, messageId, {
            useful: request.useful,
            comment,
        });
        if (!saved) {
            throw new NotFoundException('Mensaje no encontrado');
        }
    }
}