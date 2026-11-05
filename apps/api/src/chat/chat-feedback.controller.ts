// POST /api/chat/messages/:id/feedback (HU25). Requiere sesión.
import {
    Body,
    Controller,
    HttpCode,
    Param,
    ParseUUIDPipe,
    Post,
    UseGuards,
    ValidationPipe,
} from '@nestjs/common';
import { CurrentUser, JwtAuthGuard, type AuthUser } from '../common/auth';
import { ChatFeedbackDto } from './chat-feedback.dto';
import { ChatFeedbackService } from './chat-feedback.service';

@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatFeedbackController {
    constructor(private readonly feedback: ChatFeedbackService) { }

    @Post('messages/:id/feedback')
    @HttpCode(204)
    async record(
        @CurrentUser() user: AuthUser,
        @Param('id', ParseUUIDPipe) id: string,
        @Body(new ValidationPipe({ whitelist: true })) body: ChatFeedbackDto,
    ): Promise<void> {
        await this.feedback.record(user.id, id, body);
    }
}