// Spec 009 (T11): askStream lee la transmisión de POST /api/chat/stream.
import { describe, expect, test, vi } from 'vitest';
import { ApiError, type StreamingApiClient } from '@/lib/api';
import { ChatStreamError, createChatApi, type ChatStreamDone } from '@/lib/api/chat';

const DONE: ChatStreamDone = {
  conversationId: 'c-1',
  messageId: 'm-1',
  status: 'answered',
  answer: 'El plazo es de 5 días [S1].',
  sources: [],
};

const event = (name: string, data: unknown) => `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`;

// Un cuerpo que entrega cada fragmento por separado, como una transmisión real.
function bodyOf(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

function clientReturning(response: Response | Error | DOMException): StreamingApiClient & { stream: ReturnType<typeof vi.fn> } {
  return {
    request: vi.fn(),
    stream: vi.fn(async () => {
      if (!(response instanceof Response)) throw response;
      return response;
    }),
  };
}

describe('askStream (spec 009)', () => {
  test('manda la pregunta y avisa start, cada delta y devuelve done', async () => {
    const client = clientReturning(
      bodyOf([
        event('start', { conversationId: 'c-1' }),
        event('delta', { text: 'El plazo ' }),
        event('delta', { text: 'es de 5 días [S1].' }),
        event('done', DONE),
      ]),
    );
    const onStart = vi.fn();
    const onDelta = vi.fn();

    const done = await createChatApi(client).askStream(
      { message: '¿Plazo?', conversationId: 'c-1' },
      { onStart, onDelta },
    );

    expect(done).toEqual(DONE);
    expect(onStart).toHaveBeenCalledWith('c-1');
    expect(onDelta.mock.calls).toEqual([['El plazo '], ['es de 5 días [S1].']]);
    const [path, init] = client.stream.mock.calls[0] as [string, RequestInit];
    expect(path).toBe('/api/chat/stream');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ message: '¿Plazo?', conversationId: 'c-1' });
    expect(new Headers(init.headers).get('Content-Type')).toBe('application/json');
  });

  test('un evento partido entre fragmentos se lee igual', async () => {
    const all = event('start', { conversationId: 'c-1' }) + event('done', DONE);
    const client = clientReturning(bodyOf([all.slice(0, 20), all.slice(20, 50), all.slice(50)]));

    await expect(createChatApi(client).askStream({ message: 'hola' })).resolves.toEqual(DONE);
  });

  test('el evento error es un ChatStreamError de tipo error, con su cuerpo', async () => {
    const client = clientReturning(
      bodyOf([event('start', { conversationId: 'c-1' }), event('error', { statusCode: 503, message: 'caído' })]),
    );

    const error = await createChatApi(client).askStream({ message: 'hola' }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ChatStreamError);
    expect(error).toMatchObject({ kind: 'error', statusCode: 503, message: 'caído' });
  });

  test('E10: un cuerpo que termina sin evento final es un corte', async () => {
    const client = clientReturning(
      bodyOf([event('start', { conversationId: 'c-1' }), event('delta', { text: 'El plazo ' })]),
    );

    await expect(createChatApi(client).askStream({ message: 'hola' })).rejects.toMatchObject({ kind: 'cut' });
  });

  test('un error HTTP antes de transmitir es un ChatStreamError de tipo http, con el ApiError', async () => {
    const apiError = new ApiError(404, ['Conversación no encontrada']);
    const client = clientReturning(apiError);

    const error = await createChatApi(client).askStream({ message: 'hola' }).catch((e: unknown) => e);

    expect(error).toMatchObject({ kind: 'http', statusCode: 404, apiError });
  });

  test('sin conexión (ApiError 0) es un corte', async () => {
    const client = clientReturning(new ApiError(0));

    await expect(createChatApi(client).askStream({ message: 'hola' })).rejects.toMatchObject({ kind: 'cut' });
  });

  test('un pedido cortado deja pasar el AbortError', async () => {
    const client = clientReturning(new DOMException('cortado', 'AbortError'));

    await expect(createChatApi(client).askStream({ message: 'hola' })).rejects.toMatchObject({ name: 'AbortError' });
  });
});

describe('askStream con el contexto del paso (spec 010, T09)', () => {
  const sentBody = (client: { stream: ReturnType<typeof vi.fn> }) =>
    JSON.parse((client.stream.mock.calls[0] as [string, RequestInit])[1].body as string) as Record<string, unknown>;

  test('manda context cuando viene', async () => {
    const client = clientReturning(bodyOf([event('start', { conversationId: 'c-1' }), event('done', DONE)]));
    const context = { procedureVersionId: 'v-1', stepId: 's-1' };

    await createChatApi(client).askStream({ message: 'hola', context });

    expect(sentBody(client)).toEqual({ message: 'hola', context });
  });

  test('sin context, el cuerpo no lo lleva', async () => {
    const client = clientReturning(bodyOf([event('start', { conversationId: 'c-1' }), event('done', DONE)]));

    await createChatApi(client).askStream({ message: 'hola' });

    expect(sentBody(client)).not.toHaveProperty('context');
  });
});
