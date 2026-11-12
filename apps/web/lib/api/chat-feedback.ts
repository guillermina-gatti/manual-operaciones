// HU25: POST /api/chat/messages/:id/feedback (Contrato 4). Responde 204: no hay cuerpo que leer.
import type { ApiClient } from './client';

export interface ChatFeedbackBody {
    useful: boolean;
    comment?: string; // hasta 500 caracteres
}

export function createChatFeedbackApi(client: ApiClient) {
    return {
        recordFeedback(messageId: string, body: ChatFeedbackBody) {
            return client.request<void>(`/api/chat/messages/${encodeURIComponent(messageId)}/feedback`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
        },
    };
}