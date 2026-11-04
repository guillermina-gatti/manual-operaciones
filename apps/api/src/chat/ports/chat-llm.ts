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

export abstract class ChatLlm {
    abstract answer(question: string, passages: Passage[]): Promise<LlmAnswer>;
}