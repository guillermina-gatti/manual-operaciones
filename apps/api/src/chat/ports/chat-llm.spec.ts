// Spec 009 (T02, R12): el streaming del puerto, con la implementación por defecto.
import { ChatLlm, type LlmAnswer, type Passage } from './chat-llm';

const PASSAGES: Passage[] = [{ ref: 'S1', documentTitle: 'Manual', section: null, content: 'Texto.' }];

// Como el FakeLlm de chat.service.spec.ts: implementa solo answer.
class AnswerOnlyLlm extends ChatLlm {
    calls = 0;
    constructor(private readonly reply: LlmAnswer | Error) {
        super();
    }
    async answer(): Promise<LlmAnswer> {
        this.calls++;
        if (this.reply instanceof Error) throw this.reply;
        return this.reply;
    }
}

const REPLY: LlmAnswer = { text: 'El plazo es de 5 días [S1].', modelName: 'fake', inputTokens: 3, outputTokens: 4 };

async function collect(parts: AsyncIterable<string>): Promise<string[]> {
    const out: string[] = [];
    for await (const part of parts) out.push(part);
    return out;
}

describe('ChatLlm.stream por defecto (spec 009, R12)', () => {
    it('entrega el texto de answer en una sola parte, y final es lo mismo que answer', async () => {
        const llm = new AnswerOnlyLlm(REPLY);

        const stream = llm.stream('¿plazo?', PASSAGES, new AbortController().signal);

        expect(await collect(stream.textStream)).toEqual([REPLY.text]);
        await expect(stream.final).resolves.toEqual(REPLY);
        expect(llm.calls).toBe(1);
    });

    it('si answer falla, fallan las partes y final', async () => {
        const llm = new AnswerOnlyLlm(new Error('model down'));

        const stream = llm.stream('¿plazo?', PASSAGES, new AbortController().signal);

        await expect(collect(stream.textStream)).rejects.toThrow('model down');
        await expect(stream.final).rejects.toThrow('model down');
    });

    it('con la señal ya abortada rechaza sin llamar a answer', async () => {
        const llm = new AnswerOnlyLlm(REPLY);
        const controller = new AbortController();
        controller.abort();

        const stream = llm.stream('¿plazo?', PASSAGES, controller.signal);

        await expect(stream.final).rejects.toThrow();
        await expect(collect(stream.textStream)).rejects.toThrow();
        expect(llm.calls).toBe(0);
    });
});

describe('ChatLlm.stream por defecto con contexto (spec 010, R6)', () => {
    it('le pasa el contexto del paso a answer', async () => {
        const received: unknown[] = [];
        class RecordingLlm extends ChatLlm {
            async answer(_q: string, _p: Passage[], context?: unknown): Promise<LlmAnswer> {
                received.push(context);
                return REPLY;
            }
        }
        const context = {
            procedureVersionId: 'v',
            stepId: 's',
            procedureTitle: 'Cierre',
            stepOrder: 3,
            stepTitle: 'Contar',
            stepDescription: '',
        };

        await collect(new RecordingLlm().stream('¿plazo?', PASSAGES, new AbortController().signal, context).textStream);

        expect(received).toEqual([context]);
    });

    // Spec 011 (ajuste del 11/11/2026): también las opciones del segundo pedido.
    it('le pasa las opciones a answer', async () => {
        const received: unknown[] = [];
        class RecordingLlm extends ChatLlm {
            async answer(_q: string, _p: Passage[], _context?: unknown, options?: unknown): Promise<LlmAnswer> {
                received.push(options);
                return REPLY;
            }
        }
        const options = { sameDocumentRefs: ['S1', 'S2'] as [string, string] };

        await collect(
            new RecordingLlm().stream('¿plazo?', PASSAGES, new AbortController().signal, undefined, options).textStream,
        );

        expect(received).toEqual([options]);
    });
});
