// El estado de la conversación de la pantalla del asistente (spec 009, sección 7 y F7).
import type { ChatResultStatus, ChatSource } from '@/lib/api';

// Además de los estados de la API: transmitiendo, cortada, con error y pedido inválido (400 o 404).
// Spec 010: step-gone, el paso ya no está disponible (F5).
export type AssistantStatus = 'streaming' | ChatResultStatus | 'cut' | 'error' | 'invalid' | 'step-gone';

export interface UserMessage {
  id: number;
  role: 'user';
  text: string;
}

export interface AssistantMessage {
  id: number;
  role: 'assistant';
  question: string;
  status: AssistantStatus;
  text: string;
  sources: ChatSource[];
  searchUrl?: string;
  // El aviso de un corte, un error o un pedido inválido.
  notice?: string;
}

export type ChatMessageItem = UserMessage | AssistantMessage;

// El texto para anunciar, sin las marcas [Sn].
export const withoutMarkers = (text: string) => text.replace(/\s?\[S\d+\]/g, '');
