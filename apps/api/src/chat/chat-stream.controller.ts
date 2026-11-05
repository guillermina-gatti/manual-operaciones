// POST /api/chat/stream (spec 009, HU20): la misma consulta que POST /api/chat, transmitida con
// eventos SSE en la respuesta del POST. Los errores que se conocen antes de transmitir (400, 401,
// 404, 503) salen como JSON, igual que en las demás rutas (R2).
import { Body, Controller, Post, Req, Res, UseGuards, ValidationPipe } from '@nestjs/common';
import {
    ApiBearerAuth,
    ApiBody,
    ApiOperation,
    ApiProduces,
    ApiResponse,
    ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { CurrentUser, JwtAuthGuard, type AuthUser } from '../common/auth';
import { ChatRequestDto } from './chat.dto';
import { ChatStreamService } from './chat-stream.service';
import { sseSink } from './sse-writer';

const EVENTS_DESCRIPTION = [
    'Eventos SSE, cada uno con `event:`, `data:` (JSON en una línea) y una línea vacía:',
    '- `start` `{ conversationId }`: uno solo, primero.',
    '- `delta` `{ text }`: cero o más partes del texto, solo con status answered.',
    '- `done`: la respuesta de POST /api/chat (ChatResult), más `searchUrl` con status ai_unavailable.',
    '  Con status conflict (spec 011) no hay `delta`: `answer` explica lo que dice cada documento y',
    '  `sources` son exactamente los dos pasajes que se contradicen, uno de cada documento.',
    '- `error` `{ statusCode, message }`: si falla después de abrir la transmisión.',
    'Siempre hay un solo evento final (done o error). Las líneas que empiezan con ":" son comentarios.',
].join('\n');

@ApiTags('Asistente')
@ApiBearerAuth()
@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatStreamController {
    constructor(private readonly chat: ChatStreamService) { }

    @Post('stream')
    @ApiOperation({ summary: 'Consultar al asistente y recibir la respuesta en partes (spec 009)' })
    @ApiBody({ type: ChatRequestDto })
    @ApiProduces('text/event-stream')
    @ApiResponse({ status: 200, description: EVENTS_DESCRIPTION })
    @ApiResponse({
        status: 400,
        description: 'Pedido inválido (también un context mal formado) o una conversación de otro paso (spec 010)',
    })
    @ApiResponse({ status: 401, description: 'Sin sesión o sesión vencida' })
    @ApiResponse({
        status: 404,
        description: 'La conversación no existe o es de otro usuario, o el paso del context no está disponible (spec 010)',
    })
    @ApiResponse({ status: 503, description: 'La base no responde al resolver la conversación' })
    async stream(
        @CurrentUser() user: AuthUser,
        @Body(new ValidationPipe({ whitelist: true })) body: ChatRequestDto,
        @Req() req: Request,
        @Res() res: Response,
    ): Promise<void> {
        // Antes de transmitir: si lanza, Nest responde el error en JSON (no se escribió nada todavía).
        const opened = await this.chat.open(user, body);

        res.status(200);
        res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.setHeader('X-Accel-Buffering', 'no');
        res.flushHeaders();

        // Si el cliente se va antes del final, se corta el modelo y no se guarda (R11, PD8).
        const client = new AbortController();
        const onClose = () => {
            if (!res.writableEnded) client.abort();
        };
        res.on('close', onClose);
        req.on('aborted', onClose);

        try {
            await this.chat.run(user, opened, sseSink(res), client.signal);
        } finally {
            res.off('close', onClose);
            req.off('aborted', onClose);
            if (!res.writableEnded) res.end();
        }
    }
}
