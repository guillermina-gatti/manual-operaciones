// Validación de POST /api/chat/messages/:id/feedback según el Contrato 4.
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import type { ChatFeedbackRequest } from './chat.contract';

export class ChatFeedbackDto implements ChatFeedbackRequest {
    @IsBoolean()
    useful!: boolean;

    @IsOptional()
    @IsString()
    @MaxLength(500)
    comment?: string;
}