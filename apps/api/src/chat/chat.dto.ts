// Validación de POST /api/chat según el Contrato 4.
import { IsNotEmpty, IsObject, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import type { ChatRequest } from './chat.contract';

export class ChatRequestDto implements ChatRequest {
    @IsOptional()
    @IsUUID()
    conversationId?: string;

    @IsString()
    @IsNotEmpty()
    @MaxLength(2000)
    message!: string;

    // Contexto de procedimiento (HU21): se acepta y se valida en esa historia.
    @IsOptional()
    @IsObject()
    context?: { procedureVersionId: string; stepId: string };
}