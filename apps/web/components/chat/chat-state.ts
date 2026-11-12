// El estado de la conversación de la pantalla del asistente (spec 009, sección 7 y F7).
import type { ChatResultStatus, ChatSource, NearestDocument } from '@/lib/api';

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
  // HU25: el id del mensaje en la API, para valorarlo. Llega con el evento done.
  messageId?: string;
  // HU19: con no_info, los documentos más cercanos a la consulta.
  nearestDocuments?: NearestDocument[];
  // HU19: con no_info, a quién consultar (si la API tiene un contacto).
  suggestedContact?: { name: string; email: string };
  // El aviso de un corte, un error o un pedido inválido.
  notice?: string;
}

export type ChatMessageItem = UserMessage | AssistantMessage;

// El texto para anunciar, sin las marcas [Sn].
export const withoutMarkers = (text: string) => text.replace(/\s?\[S\d+\]/g, '');