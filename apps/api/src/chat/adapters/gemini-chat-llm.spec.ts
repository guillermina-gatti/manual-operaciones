// Spec 009 (T03, R13): la respuesta de Gemini en partes, con el mismo prompt que answer.
// El modelo es el simulado del AI SDK: ningún test llama a Gemini.
import { MockLanguageModelV4, simulateReadableStream } from 'ai/test';
import type { Passage } from '../ports/chat-llm';
import { GeminiChatLlm } from './gemini-chat-llm';

const PASSAGES: Passage[] = [
    { ref: 'S1', documentTitle: 'Manual de compras', section: 'Aprobaciones', content: 'Pedir aprobación.' },
    { ref: 'S2', documentTitle: 'Plazos', section: null, content: 'El plazo es de 5 días.' },
];

// Las partes del protocolo del modelo (StreamPart), sin importar @ai-sdk/provider,
// que no es dependencia directa de la API.
type StreamPart = { type: string } & Record<string, unknown>;
type MockStream = Exclude<ConstructorParameters<typeof MockLanguageModelV4>[0], undefined>['doStream'];

const USAGE = {
    inputTokens: { total: 12, noCache: 12, cacheRead: undefined, cacheWrite: undefined },
    outputTokens: { total: 7, text: 7, reasoning: undefined },
};

function streamOf(parts: string[], extra: StreamPart[] = [], delay?: number) {
    const chunks: StreamPart[] = [
        { type: 'text-start', id: 't1' },
        ...parts.map((delta): StreamPart => ({ type: 'text-delta', id: 't1', delta })),
        ...extra,
        { type: 'text-end', id: 't1' },
        { type: 'finish', finishReason: { unified: 'stop', raw: undefined }, usage: USAGE },
    ];
    return { stream: simulateReadableStream({ chunks, chunkDelayInMs: delay ?? null }) } as unknown as Extract<
        MockStream,
        { stream: unknown }
    >;
}

function modelWith(parts: string[], extra: StreamPart[] = [], delay?: number) {
    return new MockLanguageModelV4({
        doStream: async () => streamOf(parts, extra, delay),
        doGenerate: {
            content: [{ type: 'text', text: parts.join('') }],
            finishReason: { unified: 'stop', raw: undefined },
            usage: USAGE,
            warnings: [],
        },
    });
}

async function collect(parts: AsyncIterable<string>): Promise<string[]> {
    const out: string[] = [];
    for await (const part of parts) out.push(part);
    return out;
}

describe('GeminiChatLlm.stream (spec 009, R13)', () => {
    it('entrega las partes en orden y final con el texto, el modelo y los tokens', async () => {
        const llm = new GeminiChatLlm(modelWith(['El plazo ', 'es de 5 días ', '[S2]. ']), 'gemini-test');

        const stream = llm.stream('¿plazo?', PASSAGES, new AbortController().signal);

        expect(await collect(stream.textStream)).toEqual(['El plazo ', 'es de 5 días ', '[S2]. ']);
        await expect(stream.final).resolves.toEqual({
            text: 'El plazo es de 5 días [S2].',
            modelName: 'gemini-test',
            inputTokens: 12,
            outputTokens: 7,
        });
    });

    it('el modelo recibe el mismo sistema y el mismo prompt que con answer', async () => {
        const model = modelWith(['Hola [S1].']);
        const llm = new GeminiChatLlm(model, 'gemini-test');

        await llm.answer('¿Cómo pido?', PASSAGES);
        await collect(llm.stream('¿Cómo pido?', PASSAGES, new AbortController().signal).textStream);

        expect(model.doStreamCalls[0].prompt).toEqual(model.doGenerateCalls[0].prompt);
        expect(JSON.stringify(model.doStreamCalls[0].prompt)).toContain('[S2] Plazos · sin sección');
    });

    it('la señal llega al modelo y cortarla corta las partes y final', async () => {
        const model = modelWith(['uno ', 'dos ', 'tres ', 'cuatro'], [], 20);
        const llm = new GeminiChatLlm(model, 'gemini-test');
        const controller = new AbortController();

        const stream = llm.stream('¿plazo?', PASSAGES, controller.signal);
        const received: string[] = [];
        const reading = (async () => {
            for await (const part of stream.textStream) {
                received.push(part);
                if (received.length === 1) controller.abort();
            }
        })();

        await expect(reading).rejects.toThrow();
        await expect(stream.final).rejects.toThrow();
        expect(received.length).toBeLessThan(4);
        expect(model.doStreamCalls[0].abortSignal).toBeDefined();
    });

    it('un error del modelo a mitad hace fallar las partes y final', async () => {
        const llm = new GeminiChatLlm(
            modelWith(['El plazo '], [{ type: 'error', error: new Error('model down') }]),
            'gemini-test',
        );

        const stream = llm.stream('¿plazo?', PASSAGES, new AbortController().signal);

        await expect(collect(stream.textStream)).rejects.toThrow('model down');
        await expect(stream.final).rejects.toThrow('model down');
    });
});
