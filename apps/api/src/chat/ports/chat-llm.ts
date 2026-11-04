// Puerto del modelo de lenguaje. La implementación real usa Gemini a través del AI SDK.
export interface Passage {
    ref: string; // S1, S2, ... (marca que el modelo debe citar)
    documentTitle: string;
    section: string | null;
    content: string;
}

export interface LlmAnswer {
    text: string;
    modelName: string;
    inputTokens?: number;
    outputTokens?: number;
}

// Spec 009 (R12): la respuesta en partes y, al terminar, lo mismo que answer.
export interface LlmStream {
    textStream: AsyncIterable<string>; // las partes del texto, en orden
    final: Promise<LlmAnswer>; // texto completo, modelo y tokens
}

export abstract class ChatLlm {
    abstract answer(question: string, passages: Passage[]): Promise<LlmAnswer>;

    // No es abstracto, para que las clases que ya extienden ChatLlm sigan compilando: por defecto
    // usa answer y entrega el texto en una sola parte. La señal corta antes de empezar.
    stream(question: string, passages: Passage[], signal: AbortSignal): LlmStream {
        const final = signal.aborted
            ? Promise.reject(signal.reason instanceof Error ? signal.reason : new Error('Pedido cortado'))
            : this.answer(question, passages);
        // Quien solo lee las partes no deja un rechazo sin manejar en final.
        final.catch(() => undefined);
        async function* parts(): AsyncGenerator<string> {
            yield (await final).text;
        }
        return { textStream: parts(), final };
    }
}