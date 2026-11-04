// Spec 009 (R3): los eventos SSE de POST /api/chat/stream sobre la respuesta HTTP del POST.
import type { ChatEventSink } from './chat-stream.types';

// Lo mínimo de la respuesta de Express que hace falta (así se prueba sin HTTP).
export interface SseResponse {
    write(chunk: string): boolean;
    readonly writableEnded: boolean;
}

// "event: <nombre>\ndata: <JSON en una línea>\n\n". JSON.stringify escapa los saltos de línea.
export function formatEvent(event: string, data: unknown): string {
    return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export function sseSink(res: SseResponse): ChatEventSink {
    const send = (event: string, data: unknown) => {
        if (!res.writableEnded) res.write(formatEvent(event, data));
    };
    return {
        start: (data) => send('start', data),
        delta: (data) => send('delta', data),
        done: (data) => send('done', data),
        error: (data) => send('error', data),
    };
}
