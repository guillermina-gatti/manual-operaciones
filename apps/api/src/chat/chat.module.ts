// Módulo del chat (HU17). Reutiliza el EmbeddingProvider de ProcessingModule.
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ProcessingModule } from '../processing/processing.module';
import { createChatLlm } from './adapters/gemini-chat-llm';
import { PrismaChatContextStore } from './adapters/prisma-chat-context-store';
import { PrismaConflictAlertRecorder } from './adapters/prisma-conflict-alert-recorder';
import { PrismaChatRepository } from './adapters/prisma-chat-repository';
import { PrismaChatRetrieval } from './adapters/prisma-chat-retrieval';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { ChatStreamController } from './chat-stream.controller';
import { ChatStreamService } from './chat-stream.service';
import { ChatContextStore } from './ports/chat-context-store';
import { ConflictAlertRecorder } from './ports/conflict-alert-recorder';
import { ChatLlm } from './ports/chat-llm';
import { ChatRepository } from './ports/chat-repository';
import { ChatRetrieval } from './ports/chat-retrieval';

@Module({
    imports: [ProcessingModule],
    controllers: [ChatController, ChatStreamController], // spec 009: POST /api/chat/stream
    providers: [
        ChatService,
        ChatStreamService, // spec 009
        { provide: ChatRetrieval, useClass: PrismaChatRetrieval },
        { provide: ChatRepository, useClass: PrismaChatRepository },
        { provide: ChatContextStore, useClass: PrismaChatContextStore }, // spec 010
        { provide: ConflictAlertRecorder, useClass: PrismaConflictAlertRecorder }, // spec 011
        {
            // El modelo de chat sale de GEMINI_CHAT_MODEL (gemini-2.5-flash por defecto).
            provide: ChatLlm,
            inject: [ConfigService],
            useFactory: (config: ConfigService) => createChatLlm(config),
        },
    ],
})
export class ChatModule { }