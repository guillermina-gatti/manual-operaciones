// Módulo del chat (HU17). Reutiliza el EmbeddingProvider de ProcessingModule.
import { google } from '@ai-sdk/google';
import { Module } from '@nestjs/common';
import { ProcessingModule } from '../processing/processing.module';
import { CHAT_MODEL_ID, GeminiChatLlm } from './adapters/gemini-chat-llm';
import { PrismaChatRepository } from './adapters/prisma-chat-repository';
import { PrismaChatRetrieval } from './adapters/prisma-chat-retrieval';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { ChatLlm } from './ports/chat-llm';
import { ChatRepository } from './ports/chat-repository';
import { ChatRetrieval } from './ports/chat-retrieval';

@Module({
    imports: [ProcessingModule],
    controllers: [ChatController],
    providers: [
        ChatService,
        { provide: ChatRetrieval, useClass: PrismaChatRetrieval },
        { provide: ChatRepository, useClass: PrismaChatRepository },
        {
            provide: ChatLlm,
            useFactory: () => new GeminiChatLlm(google(CHAT_MODEL_ID), CHAT_MODEL_ID),
        },
    ],
})
export class ChatModule { }