// Módulo del chat (HU17 y HU25). Reutiliza el EmbeddingProvider de ProcessingModule.
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ProcessingModule } from '../processing/processing.module';
import { StorageModule } from '../storage/storage.module';
import { createChatLlm } from './adapters/gemini-chat-llm';
import { PrismaChatContextStore } from './adapters/prisma-chat-context-store';
import { PrismaChatFeedbackRepository } from './adapters/prisma-chat-feedback-repository';
import { PrismaConflictAlertRecorder } from './adapters/prisma-conflict-alert-recorder';
import { PrismaContactDirectory } from './adapters/prisma-contact-directory';
import { PrismaChatDocumentsCatalog } from './adapters/prisma-chat-documents-catalog';
import { PrismaChatConversationsRepository } from './adapters/prisma-chat-conversations-repository';
import { ContactDirectory } from './ports/contact-directory';
import { ChatConversationsRepository } from './ports/chat-conversations-repository';
import { PrismaChatRepository } from './adapters/prisma-chat-repository';
import { PrismaChatRetrieval } from './adapters/prisma-chat-retrieval';
import { ChatController } from './chat.controller';
import { ChatConversationsController } from './chat-conversations.controller';
import { ChatConversationsService } from './chat-conversations.service';
import { ChatFeedbackController } from './chat-feedback.controller';
import { ChatFeedbackService } from './chat-feedback.service';
import { ChatService } from './chat.service';
import { ChatStreamController } from './chat-stream.controller';
import { ChatStreamService } from './chat-stream.service';
import { ChatContextStore } from './ports/chat-context-store';
import { ChatDocumentsCatalog } from './ports/chat-documents-catalog';
import { ChatFeedbackRepository } from './ports/chat-feedback-repository';
import { ConflictAlertRecorder } from './ports/conflict-alert-recorder';
import { ChatLlm } from './ports/chat-llm';
import { ChatRepository } from './ports/chat-repository';
import { ChatRetrieval } from './ports/chat-retrieval';

@Module({
    imports: [ProcessingModule, StorageModule], // StorageModule: FileStorage para los enlaces de HU18
    controllers: [
        ChatController,
        ChatStreamController,
        ChatFeedbackController, // HU25
        ChatConversationsController, // historial: listar, abrir y borrar
    ],
    providers: [
        ChatService,
        ChatStreamService, // spec 009
        ChatFeedbackService, // HU25
        ChatConversationsService, // historial
        { provide: ChatRetrieval, useClass: PrismaChatRetrieval },
        { provide: ChatRepository, useClass: PrismaChatRepository },
        { provide: ChatConversationsRepository, useClass: PrismaChatConversationsRepository }, // historial
        { provide: ChatFeedbackRepository, useClass: PrismaChatFeedbackRepository }, // HU25
        { provide: ChatContextStore, useClass: PrismaChatContextStore }, // spec 010
        { provide: ConflictAlertRecorder, useClass: PrismaConflictAlertRecorder }, // spec 011
        { provide: ContactDirectory, useClass: PrismaContactDirectory }, // HU19
        { provide: ChatDocumentsCatalog, useClass: PrismaChatDocumentsCatalog }, // listado de documentos por área
        {
            // El modelo de chat sale de GEMINI_CHAT_MODEL (gemini-2.5-flash por defecto).
            provide: ChatLlm,
            inject: [ConfigService],
            useFactory: (config: ConfigService) => createChatLlm(config),
        },
    ],
})
export class ChatModule { }
