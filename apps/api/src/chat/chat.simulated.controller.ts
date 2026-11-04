// CONTRATO SIMULADO (pareja C). Publica la forma de POST /api/chat para que
// Matías (ChatPanel, HU20/HU21/HU39) integre desde ya. NO reemplaza la implementación real.
//
// Diferencias con el contrato final, a propósito:
// - devuelve JSON, no streaming (el stream del AI SDK llega con HU20);
// - no tiene guard de autenticación: agregar JwtAuthGuard antes de mergear a develop.
//
// Para usarlo: registrarlo en ChatModule (o en app.module durante la simulación).

import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import type { ChatRequest, ChatResult, ChatFeedbackRequest } from './chat.contract';

const FAKE_CONVERSATION_ID = '00000000-0000-4000-8000-000000000001';
const FAKE_MESSAGE_ID = '00000000-0000-4000-8000-000000000002';

@Controller('chat')
export class ChatSimulatedController {
    @Post()
    @HttpCode(200)
    ask(@Body() body: ChatRequest): ChatResult {
        return {
            conversationId: body.conversationId ?? FAKE_CONVERSATION_ID,
            messageId: FAKE_MESSAGE_ID,
            status: 'answered',
            answer: `Respuesta de ejemplo (simulada) a: "${body.message}" [cita:simulada-1]`,
            sources: [
                {
                    documentId: '00000000-0000-4000-8000-000000000010',
                    documentTitle: 'Manual de ejemplo',
                    versionNumber: 1,
                    section: 'Sección simulada',
                    chunkId: 'simulada-1',
                    validFrom: '2026-11-04',
                    url: 'https://example.invalid/simulado',
                },
            ],
        };
    }

    @Get('conversations/:id')
    conversation(@Param('id') id: string) {
        return { id, title: 'Conversación simulada', messages: [] };
    }

    @Post('messages/:id/feedback')
    @HttpCode(204)
    feedback(@Param('id') _id: string, @Body() _body: ChatFeedbackRequest): void {
        return;
    }
}