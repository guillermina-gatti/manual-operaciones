// Módulo del chat (HU17). Reutiliza el EmbeddingProvider de ProcessingModule.
import { google } from '@ai-sdk/google';
import { Module } from '@nestjs/common';
import { ProcessingModule } from '../processing/processing.module';
import { CHAT_MODEL_ID, GeminiChatLlm } from './adapters/gemini-chat-llm';
import { PrismaChatRepository } from './adapters/prisma-chat-repository';
import { PrismaChatRetrieval } from './adapters/prisma-chat-retrieval';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { ChatStreamController } from './chat-stream.controller';
import { ChatStreamService } from './chat-stream.service';
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
        {
            provide: ChatLlm,
            useFactory: () => new GeminiChatLlm(google(CHAT_MODEL_ID), CHAT_MODEL_ID),
        },
    ],
})
export class ChatModule { }