// Spec 009 (T11, R3): el lector de eventos SSE, incremental.
import { describe, expect, test } from 'vitest';
import { createSseParser, type SseEvent } from '@/lib/chat/sse';

function parse(chunks: string[]): SseEvent[] {
  const events: SseEvent[] = [];
  const parser = createSseParser((event) => events.push(event));
  for (const chunk of chunks) parser.push(chunk);
  parser.end();
  return events;
}

describe('createSseParser (spec 009)', () => {
  test('un evento con su nombre y su data', () => {
    expect(parse(['event: start\ndata: {"conversationId":"c-1"}\n\n'])).toEqual([
      { event: 'start', data: '{"conversationId":"c-1"}' },
    ]);
  });

  test('un evento partido en tres fragmentos', () => {
    expect(parse(['eve', 'nt: delta\ndata: {"te', 'xt":"Hola"}\n\n'])).toEqual([
      { event: 'delta', data: '{"text":"Hola"}' },
    ]);
  });

  test('acepta \\r\\n como separador', () => {
    expect(parse(['event: delta\r\ndata: {"text":"a"}\r\n\r\nevent: delta\r\ndata: {"text":"b"}\r\n\r\n'])).toEqual([
      { event: 'delta', data: '{"text":"a"}' },
      { event: 'delta', data: '{"text":"b"}' },
    ]);
  });

  test('dos eventos en un fragmento, y el separador partido entre fragmentos', () => {
    expect(parse(['event: start\ndata: {}\n\nevent: delta\ndata: {"text":"x"}\n', '\n'])).toEqual([
      { event: 'start', data: '{}' },
      { event: 'delta', data: '{"text":"x"}' },
    ]);
  });

  test('ignora los comentarios y junta varias líneas data', () => {
    expect(parse([': ping\n\nevent: delta\ndata: uno\ndata: dos\n\n'])).toEqual([
      { event: 'delta', data: 'uno\ndos' },
    ]);
  });

  test('sin línea event, el nombre es "message"; un bloque sin data no es un evento', () => {
    expect(parse(['data: hola\n\nevent: vacio\n\n'])).toEqual([{ event: 'message', data: 'hola' }]);
  });

  test('un evento sin la línea vacía final se descarta: la transmisión se cortó', () => {
    expect(parse(['event: done\ndata: {"status":"answ'])).toEqual([]);
  });
});
