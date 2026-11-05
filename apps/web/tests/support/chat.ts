// Spec 009: una respuesta de POST /api/chat/stream que el test va escribiendo de a eventos, para ver
// la pantalla mientras la respuesta llega (antes de done).
import type { ChatStreamDone } from '../../lib/api';

export interface ControlledStream {
  response: Response;
  send(event: string, data: unknown): void;
  close(): void;
  readonly cancelled: boolean;
}

export function controlledStream(): ControlledStream {
  const encoder = new TextEncoder();
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
    cancel() {
      cancelled = true;
    },
  });
  return {
    response: new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } }),
    send(event, data) {
      controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
    },
    close() {
      controller.close();
    },
    get cancelled() {
      return cancelled;
    },
  };
}

export function doneOf(overrides: Partial<ChatStreamDone> = {}): ChatStreamDone {
  return {
    conversationId: 'conv-1',
    messageId: 'msg-1',
    status: 'answered',
    answer: 'El plazo es de 5 días [S1].',
    sources: [
      {
        documentId: 'doc-1',
        documentTitle: 'Manual de compras',
        versionNumber: 2,
        section: 'Aprobaciones',
        chunkId: 'chunk-1',
        validFrom: '2026-10-01',
        url: '',
      },
    ],
    ...overrides,
  };
}
