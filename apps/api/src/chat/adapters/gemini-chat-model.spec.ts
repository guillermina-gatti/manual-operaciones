// El modelo de chat de Gemini sale de GEMINI_CHAT_MODEL, con "gemini-2.5-flash" por defecto. Lo usan
// las dos rutas (POST /api/chat y POST /api/chat/stream), porque comparten el proveedor ChatLlm.
// El modelo de embeddings no cambia.
import { ConfigService } from '@nestjs/config';
import type { FactoryProvider } from '@nestjs/common';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { MockLanguageModelV4 } from 'ai/test';
import { ChatModule } from '../chat.module';
import { ChatLlm } from '../ports/chat-llm';
import { DEFAULT_CHAT_MODEL_ID, GeminiChatLlm, chatModelId, createChatLlm } from './gemini-chat-llm';

const configWith = (env: Record<string, string | undefined>) =>
    ({ get: (key: string) => env[key] }) as Pick<ConfigService, 'get'>;

// Anota con qué ID se pidió el modelo, sin crear el de Google.
function recordingModel() {
    const ids: string[] = [];
    const make = (id: string) => {
        ids.push(id);
        return new MockLanguageModelV4({ modelId: id });
    };
    return { ids, make };
}

describe('chatModelId', () => {
    it('sin la variable, el modelo por defecto', () => {
        expect(DEFAULT_CHAT_MODEL_ID).toBe('gemini-2.5-flash');
        expect(chatModelId(undefined)).toBe('gemini-2.5-flash');
    });

    it.each(['', '   '])('vacía (%j) cuenta como sin definir', (value) => {
        expect(chatModelId(value)).toBe('gemini-2.5-flash');
    });

    it('con la variable, ese modelo, sin espacios alrededor', () => {
        expect(chatModelId(' gemini-3.8-flash ')).toBe('gemini-3.8-flash');
    });
});

describe('createChatLlm', () => {
    it('sin GEMINI_CHAT_MODEL pide gemini-2.5-flash', () => {
        const { ids, make } = recordingModel();

        const llm = createChatLlm(configWith({}), make);

        expect(llm).toBeInstanceOf(GeminiChatLlm);
        expect(ids).toEqual(['gemini-2.5-flash']);
    });

    it('con GEMINI_CHAT_MODEL pide ese modelo y lo guarda como modelName', async () => {
        const { ids, make } = recordingModel();
        const llm = createChatLlm(configWith({ GEMINI_CHAT_MODEL: 'gemini-3.8-flash' }), make);

        expect(ids).toEqual(['gemini-3.8-flash']);
        // modelName es el que queda en los mensajes guardados: se ve en la respuesta del modelo simulado.
        const model = new MockLanguageModelV4({
            doGenerate: {
                content: [{ type: 'text', text: 'Hola' }],
                finishReason: { unified: 'stop', raw: undefined },
                usage: {
                    inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
                    outputTokens: { total: 1, text: 1, reasoning: undefined },
                },
                warnings: [],
            },
        });
        const withMock = createChatLlm(configWith({ GEMINI_CHAT_MODEL: 'gemini-3.8-flash' }), () => model);
        await expect(withMock.answer('¿?', [])).resolves.toMatchObject({ modelName: 'gemini-3.8-flash' });
        expect(llm).toBeInstanceOf(GeminiChatLlm);
    });
});

describe('ChatModule', () => {
    it('arma el único ChatLlm (el de las dos rutas) con createChatLlm y ConfigService', () => {
        const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, ChatModule) as unknown[];
        const llm = providers.find(
            (p): p is FactoryProvider => typeof p === 'object' && p !== null && (p as FactoryProvider).provide === ChatLlm,
        );

        expect(llm?.inject).toEqual([ConfigService]);
        // La fábrica real del módulo (crear el modelo de Google no llama a la red).
        const withVar = llm!.useFactory(configWith({ GEMINI_CHAT_MODEL: 'gemini-3.8-flash' })) as GeminiChatLlm;
        const withoutVar = llm!.useFactory(configWith({})) as GeminiChatLlm;

        expect(withVar['modelName']).toBe('gemini-3.8-flash');
        expect(withoutVar['modelName']).toBe('gemini-2.5-flash');
    });
});
