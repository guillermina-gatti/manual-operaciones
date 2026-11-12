// Puerto del modelo de lenguaje. La implementación real usa Gemini a través del AI SDK.
import type { StepContext } from '../chat-context';

export interface Passage {
    ref: string; // S1, S2, ... (marca que el modelo debe citar)
    documentTitle: string;
    section: string | null;
    content: string;
    // Spec 011 (ajuste del 11/11/2026): el documento del pasaje. Con todos los pasajes de un mismo
    // documento, el sistema va sin las reglas de CONFLICT. Sin él, se dejan, como antes.
    documentId?: string;
}

// Spec 011 (ajuste del 11/11/2026): el segundo pedido, después de una marca CONFLICT entre dos pasajes
// del mismo documento. sameDocumentRefs son esas dos marcas (por ejemplo, S1 y S2).
export interface LlmRequestOptions {
    sameDocumentRefs?: [string, string];
}

export interface LlmAnswer {
    text: string;
    modelName: string;
    inputTokens?: number;
    outputTokens?: number;
}

// Spec 009: el pedido al modelo se cortó (por tiempo o porque el usuario se fue). providerError es el
// último error del proveedor antes del corte, si hubo (cuota, alta demanda…): así el log dice el
// motivo real y no solo "se cortó". El mensaje empieza por ese motivo.
export class LlmCutError extends Error {
    // progress: qué había hecho el proveedor al cortar (si había contestado y qué partes mandó), para el
    // log. Solo cuando no hay providerError, que ya lo explica.
    constructor(
        readonly reason: string,
        readonly providerError?: string,
        readonly progress?: string,
    ) {
        const cut = progress ? `${reason}; ${progress}` : reason;
        super(providerError ? `${providerError} (pedido cortado: ${cut})` : `Pedido cortado: ${cut}`);
        this.name = 'LlmCutError';
    }
}

// Spec 009 (R12): la respuesta en partes y, al terminar, lo mismo que answer.
export interface LlmStream {
    textStream: AsyncIterable<string>; // las partes del texto, en orden
    final: Promise<LlmAnswer>; // texto completo, modelo y tokens
}

export abstract class ChatLlm {
    // Spec 010 (R6): con context, el paso desde el que se pregunta va al prompt como datos.
    abstract answer(
        question: string,
        passages: Passage[],
        context?: StepContext,
        options?: LlmRequestOptions,
    ): Promise<LlmAnswer>;

    // No es abstracto, para que las clases que ya extienden ChatLlm sigan compilando: por defecto
    // usa answer y entrega el texto en una sola parte. La señal corta antes de empezar.
    stream(
        question: string,
        passages: Passage[],
        signal: AbortSignal,
        context?: StepContext,
        options?: LlmRequestOptions,
    ): LlmStream {
        const final = signal.aborted
            ? Promise.reject(signal.reason instanceof Error ? signal.reason : new Error('Pedido cortado'))
            : this.answer(question, passages, context, options);
        // Quien solo lee las partes no deja un rechazo sin manejar en final.
        final.catch(() => undefined);
        async function* parts(): AsyncGenerator<string> {
            yield (await final).text;
        }
        return { textStream: parts(), final };
    }
}