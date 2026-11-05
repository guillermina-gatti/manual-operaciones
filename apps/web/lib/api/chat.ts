// Spec 009 (HU20): POST /api/chat/stream. Lee la transmisión con fetch y ReadableStream (EventSource
// no admite POST) y avisa cada parte; resuelve con la respuesta final.
import { createSseParser } from '@/lib/chat/sse';
import { ApiError } from './api-error';
import type { StreamingApiClient } from './client';

// Los tipos del Contrato 4 (apps/api/src/chat/chat.contract.ts), copiados como el resto de lib/api.
export type ChatResultStatus = 'answered' | 'no_info' | 'conflict' | 'ai_unavailable';

export interface ChatSource {
  documentId: string;
  documentTitle: string;
  versionNumber: number;
  section: string;
  chunkId: string;
  validFrom: string;
  url: string;
}

export interface ChatResult {
  conversationId: string;
  messageId: string;
  status: ChatResultStatus;
  answer: string;
  sources: ChatSource[];
  suggestedContact?: { name: string; email: string };
}

// La respuesta final de la ruta nueva: searchUrl con ai_unavailable (R8).
export type ChatStreamDone = ChatResult & { searchUrl?: string };

export interface ChatRequestBody {
  message: string;
  conversationId?: string;
  // Spec 010: el paso desde el que se pregunta.
  context?: { procedureVersionId: string; stepId: string };
}

export interface AskStreamHandlers {
  signal?: AbortSignal;
  onStart?: (conversationId: string) => void;
  onDelta?: (text: string) => void;
}

// Por qué no llegó la respuesta final:
// - error: la API mandó el evento error (después de abrir la transmisión);
// - cut: la transmisión terminó sin evento final, o no hubo conexión;
// - http: la API respondió un error antes de transmitir (400, 401, 404, 503).
export type ChatStreamErrorKind = 'error' | 'cut' | 'http';

export class ChatStreamError extends Error {
  constructor(
    readonly kind: ChatStreamErrorKind,
    readonly statusCode: number,
    message: string,
    readonly apiError?: ApiError,
  ) {
    super(message);
    this.name = 'ChatStreamError';
  }
}

export function createChatApi(client: StreamingApiClient) {
  async function askStream(body: ChatRequestBody, handlers: AskStreamHandlers = {}): Promise<ChatStreamDone> {
    let response: Response;
    try {
      response = await client.stream('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: handlers.signal,
      });
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.status === 0) throw new ChatStreamError('cut', 0, 'Se cortó la conexión', error);
        throw new ChatStreamError('http', error.status, error.message, error);
      }
      throw error; // AbortError
    }

    let done: ChatStreamDone | undefined;
    let failure: ChatStreamError | undefined;
    const parser = createSseParser(({ event, data }) => {
      if (done || failure) return;
      if (event === 'start') {
        handlers.onStart?.((JSON.parse(data) as { conversationId: string }).conversationId);
      } else if (event === 'delta') {
        handlers.onDelta?.((JSON.parse(data) as { text: string }).text);
      } else if (event === 'done') {
        done = JSON.parse(data) as ChatStreamDone;
      } else if (event === 'error') {
        const { statusCode, message } = JSON.parse(data) as { statusCode: number; message: string };
        failure = new ChatStreamError('error', statusCode, message);
      }
    });

    const reader = response.body?.getReader();
    if (!reader) throw new ChatStreamError('cut', 0, 'La respuesta no trae contenido');
    const decoder = new TextDecoder();
    try {
      for (;;) {
        const { value, done: finished } = await reader.read();
        if (finished) break;
        parser.push(decoder.decode(value, { stream: true }));
      }
      parser.push(decoder.decode());
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error;
      if (handlers.signal?.aborted) throw new DOMException('Pedido cortado', 'AbortError');
      throw new ChatStreamError('cut', 0, 'Se cortó la respuesta');
    } finally {
      parser.end();
    }

    if (failure) throw failure;
    if (!done) throw new ChatStreamError('cut', 0, 'Se cortó la respuesta');
    return done;
  }

  return { askStream };
}
