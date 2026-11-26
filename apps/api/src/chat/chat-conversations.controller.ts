// Historial del asistente (GET y DELETE de /api/chat/conversations). Requiere sesión.
import {
    Controller,
    DefaultValuePipe,
    Delete,
    Get,
    HttpCode,
    Param,
    ParseIntPipe,
    ParseUUIDPipe,
    Query,
    UseGuards,
} from '@nestjs/common';
import { CurrentUser, JwtAuthGuard, type AuthUser } from '../common/auth';
import type { ConversationDetail, ConversationSummary } from './ports/chat-conversations-repository';
import { ChatConversationsService } from './chat-conversations.service';

@Controller('chat/conversations')
@UseGuards(JwtAuthGuard)
export class ChatConversationsController {
    constructor(private readonly conversations: ChatConversationsService) { }

    @Get()
    list(
        @CurrentUser() user: AuthUser,
        @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    ): Promise<ConversationSummary[]> {
        return this.conversations.list(user.id, limit);
    }

    @Get(':id')
    get(
        @CurrentUser() user: AuthUser,
        @Param('id', ParseUUIDPipe) id: string,
    ): Promise<ConversationDetail> {
        return this.conversations.get(user.id, id);
    }

    @Delete(':id')
    @HttpCode(204)
    remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
        return this.conversations.remove(user.id, id);
    }
}
