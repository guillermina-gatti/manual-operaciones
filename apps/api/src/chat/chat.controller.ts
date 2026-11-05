// POST /api/chat real (HU17). Requiere sesión: el usuario y sus áreas salen del JWT validado.
import { Body, Controller, HttpCode, Post, UseGuards, ValidationPipe } from '@nestjs/common';
import { CurrentUser, JwtAuthGuard, type AuthUser } from '../common/auth';
import type { ChatResult } from './chat.contract';
import { ChatRequestDto } from './chat.dto';
import { ChatService } from './chat.service';

@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
    constructor(private readonly chat: ChatService) { }

    @Post()
    @HttpCode(200)
    ask(
        @CurrentUser() user: AuthUser,
        @Body(new ValidationPipe({ whitelist: true })) body: ChatRequestDto,
    ): Promise<ChatResult> {
        return this.chat.ask(user, body);
    }
}