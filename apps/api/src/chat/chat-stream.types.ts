// Spec 009 (R3, R8): los eventos de POST /api/chat/stream. chat.contract.ts no cambia (D9).
import type { ChatResult } from './chat.contract';

// La respuesta final: la misma de POST /api/chat, más searchUrl si la IA no está disponible.
export type ChatStreamDone = ChatResult & { searchUrl?: string };

export interface ChatStreamErrorBody {
    statusCode: number;
    message: string;
}

// Adónde escribe el servicio los eventos: el controlador lo implementa sobre la respuesta HTTP y
// los tests, con un arreglo (PD3).
export interface ChatEventSink {
    start(data: { conversationId: string }): void;
    delta(data: { text: string }): void;
    done(data: ChatStreamDone): void;
    error(data: ChatStreamErrorBody): void;
}
