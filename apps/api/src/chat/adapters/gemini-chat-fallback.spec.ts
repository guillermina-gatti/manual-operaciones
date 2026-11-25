// Respaldo de GEMINI_FALLBACK_MODEL: cuándo cambia de modelo y cuándo no.
import { ConfigService } from '@nestjs/config';
import { APICallError } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import type { Passage } from '../ports/chat-llm';
import { GeminiChatLlm, createChatLlm, fallbackModelId } from './gemini-chat-llm';

const passages: Passage[] = [{ ref: 'S1', documentTitle: 'Manual', section: null, content: 'El plazo es 5 días.' }];

const configWith = (env: Record<string, string | undefined>) =>
    ({ get: (key: string) => env[key] }) as Pick<ConfigService, 'get'>;

const apiError = (statusCode: number) =>
    new APICallError({
        message: `HTTP ${statusCode}`,
        url: 'https://generativelanguage.googleapis.com',
        requestBodyValues: {},
        statusCode,
        isRetryable: false,
    });

const okResult = (text: string) => ({
    content: [{ type: 'text', text }],
    finishReason: { unified: 'stop', raw: undefined },
    usage: {
        inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
        outputTokens: { total: 1, text: 1, reasoning: undefined },
    },
    warnings: [],
});

// Modelo simulado: registra cada llamada y, si failWith está, falla con ese código HTTP.
function fakeModel(modelId: string, failWith?: number) {
    const calls: string[] = [];
    const model = new MockLanguageModelV4({
        modelId,
        doGenerate: async () => {
            calls.push(modelId);
            if (failWith !== undefined) throw apiError(failWith);
            return okResult(`respuesta de ${modelId}`);
        },
    });
    return { model, calls };
}

describe('fallbackModelId', () => {
    it('sin valor o vacío, no hay respaldo', () => {
        expect(fallbackModelId(undefined)).toBeUndefined();
        expect(fallbackModelId('   ')).toBeUndefined();
    });

    it('con valor, ese modelo sin espacios alrededor', () => {
        expect(fallbackModelId(' gemini-3.6-flash ')).toBe('gemini-3.6-flash');
    });
});

describe('createChatLlm con GEMINI_FALLBACK_MODEL', () => {
    it('sin respaldo, pide un solo modelo', () => {
        const ids: string[] = [];
        createChatLlm(configWith({ GEMINI_CHAT_MODEL: 'principal' }), (id) => {
            ids.push(id);
            return new MockLanguageModelV4({ modelId: id });
        });
        expect(ids).toEqual(['principal']);
    });

    it('con respaldo, pide el principal y después el respaldo', () => {
        const ids: string[] = [];
        createChatLlm(configWith({ GEMINI_CHAT_MODEL: 'principal', GEMINI_FALLBACK_MODEL: 'respaldo' }), (id) => {
            ids.push(id);
            return new MockLanguageModelV4({ modelId: id });
        });
        expect(ids).toEqual(['principal', 'respaldo']);
    });

    it('si el respaldo es igual al principal, no pide un segundo modelo', () => {
        const ids: string[] = [];
        createChatLlm(configWith({ GEMINI_CHAT_MODEL: 'igual', GEMINI_FALLBACK_MODEL: 'igual' }), (id) => {
            ids.push(id);
            return new MockLanguageModelV4({ modelId: id });
        });
        expect(ids).toEqual(['igual']);
    });
});

describe('answer con respaldo', () => {
    it('si el principal da 404 (modelo no disponible), responde el de respaldo', async () => {
        const primary = fakeModel('principal', 404);
        const backup = fakeModel('respaldo');
        const llm = new GeminiChatLlm(primary.model, 'principal', { model: backup.model, modelName: 'respaldo' });

        const answer = await llm.answer('¿Cuál es el plazo?', passages);

        expect(answer.text).toBe('respuesta de respaldo');
        expect(answer.modelName).toBe('respaldo');
        expect(primary.calls).toHaveLength(1);
        expect(backup.calls).toHaveLength(1);
    });

    it('si el principal da 401 (clave inválida), no usa el de respaldo', async () => {
        const primary = fakeModel('principal', 401);
        const backup = fakeModel('respaldo');
        const llm = new GeminiChatLlm(primary.model, 'principal', { model: backup.model, modelName: 'respaldo' });

        await expect(llm.answer('¿Cuál es el plazo?', passages)).rejects.toThrow();
        expect(backup.calls).toHaveLength(0);
    });

    it('sin respaldo configurado, el error del principal sale tal cual', async () => {
        const primary = fakeModel('principal', 404);
        const llm = new GeminiChatLlm(primary.model, 'principal');

        await expect(llm.answer('¿Cuál es el plazo?', passages)).rejects.toThrow();
    });
});
