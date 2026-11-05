// Spec 009 (T08, R3): el formato de los eventos SSE de POST /api/chat/stream.
import { formatEvent, sseSink, type SseResponse } from './sse-writer';

class FakeResponse implements SseResponse {
    chunks: string[] = [];
    writableEnded = false;
    write(chunk: string): boolean {
        this.chunks.push(chunk);
        return true;
    }
}

describe('sse-writer (spec 009, R3)', () => {
    it('cada evento es event:, data: con JSON en una línea y una línea vacía', () => {
        expect(formatEvent('start', { conversationId: 'c-1' })).toBe(
            'event: start\ndata: {"conversationId":"c-1"}\n\n',
        );
    });

    it('un texto con saltos de línea queda escapado dentro del JSON, en una sola línea data:', () => {
        const event = formatEvent('delta', { text: 'uno\ndos\r\ntres' });

        expect(event).toBe('event: delta\ndata: {"text":"uno\\ndos\\r\\ntres"}\n\n');
        expect(event.split('\n').filter((line) => line.startsWith('data:'))).toHaveLength(1);
    });

    it('el sink escribe los cuatro eventos con su nombre', () => {
        const res = new FakeResponse();
        const sink = sseSink(res);

        sink.start({ conversationId: 'c-1' });
        sink.delta({ text: 'Hola' });
        sink.done({ conversationId: 'c-1', messageId: 'm-1', status: 'answered', answer: 'Hola', sources: [] });
        sink.error({ statusCode: 503, message: 'caído' });

        expect(res.chunks.map((c) => c.split('\n')[0])).toEqual([
            'event: start',
            'event: delta',
            'event: done',
            'event: error',
        ]);
    });

    it('después de terminar la respuesta no escribe nada', () => {
        const res = new FakeResponse();
        const sink = sseSink(res);
        res.writableEnded = true;

        sink.delta({ text: 'tarde' });

        expect(res.chunks).toEqual([]);
    });
});
