// Validación de POST /api/chat según el Contrato 4.
import { Type } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength, ValidateNested } from 'class-validator';
import type { ChatRequest } from './chat.contract';
import { ChatContextDto } from './chat-context.dto';

export class ChatRequestDto implements ChatRequest {
    @IsOptional()
    @IsUUID()
    conversationId?: string;

    @IsString()
    @IsNotEmpty()
    @MaxLength(2000)
    message!: string;

    // Contexto de procedimiento (HU21, spec 010): los dos campos, cada uno un UUID.
    @IsOptional()
    @ValidateNested()
    @Type(() => ChatContextDto)
    context?: ChatContextDto;
}