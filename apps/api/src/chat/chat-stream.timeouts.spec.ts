// Spec 009 (T06): los tiempos de espera (R9, D12) y el corte del cliente (R11, D13).
import { Logger } from '@nestjs/common';
import { UNAVAILABLE_TEXT } from './chat-pipeline';
import { ChatLlm, LlmCutError, type LlmAnswer, type LlmStream, type Passage } from './ports/chat-llm';
import {
    ChatStreamService,
    EMBEDDING_TIMEOUT_MS,
    FIRST_TEXT_TIMEOUT_MS,
    IDLE_TIMEOUT_MS,
    TOTAL_TIMEOUT_MS,
} from './chat-stream.service';
import {
    FakeEmbeddings,
    FakeLlm,
    FakeRepository,
    FakeRetrieval,
    type LlmStep,
    RecordingSink,
    USER,
    chunk,
} from './testing/chat-fakes';

function build(steps: LlmStep[], embeddings: 'ok' | 'hang' = 'ok') {
    const retrieval = new FakeRetrieval([chunk()]);
    const llm = new FakeLlm(steps);
    const repo = new FakeRepository();
    const service = new ChatStreamService(new FakeEmbeddings(embeddings), retrieval, llm, repo);
    return { service, retrieval, llm, repo };
}

// Arranca la consulta sin esperarla: los tests avanzan el reloj simulado.
async function start(service: ChatStreamService, clientSignal = new AbortController().signal) {
    const sink = new RecordingSink();
    const opened = await service.open(USER, { message: '¿Cuál es el plazo?' });
    const running = service.run(USER, opened, sink, clientSignal);
    return { sink, running };
}

describe('ChatStreamService: tiempos y corte (spec 009, T06)', () => {
    beforeEach(() => {
        jest.useFakeTimers();
        jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
        jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
        jest.useRealTimers();
        jest.restoreAllMocks();
    });

    it('los tiempos son los de D12', () => {
        expect([EMBEDDING_TIMEOUT_MS, FIRST_TEXT_TIMEOUT_MS, IDLE_TIMEOUT_MS, TOTAL_TIMEOUT_MS]).toEqual([
            15_000, 15_000, 15_000, 60_000,
        ]);
    });

    it('E8: sin primer texto a los 15 s, se corta el modelo y done llega con ai_unavailable', async () => {
        const { service, llm } = build([{ hang: true }]);
        const { sink, running } = await start(service);

        await jest.advanceTimersByTimeAsync(FIRST_TEXT_TIMEOUT_MS - 1);
        expect(llm.signals[0].aborted).toBe(false);
        expect(sink.names).toEqual(['start']);

        await jest.advanceTimersByTimeAsync(1);
        await running;

        expect(llm.signals[0].aborted).toBe(true);
        expect(sink.final).toMatchObject({ status: 'ai_unavailable', answer: UNAVAILABLE_TEXT });
        expect(sink.final?.searchUrl).toMatch(/^\/documentos\?q=/);
    });

    it('E9: una parte y después 15 s sin nada, ai_unavailable, y se guarda así', async () => {
        const { service, llm, repo } = build(['El plazo es de ', { hang: true }]);
        const { sink, running } = await start(service);

        await jest.advanceTimersByTimeAsync(IDLE_TIMEOUT_MS);
        await running;

        expect(llm.signals[0].aborted).toBe(true);
        expect(sink.names).toEqual(['start', 'delta', 'done']);
        expect(sink.final?.status).toBe('ai_unavailable');
        expect(repo.saved[0].status).toBe('ai_unavailable');
    });

    it('una parte cada 10 s no se corta por inactividad, pero sí a los 60 s en total', async () => {
        const steps: LlmStep[] = ['parte0 '];
        for (let i = 1; i <= 8; i++) steps.push({ wait: 10_000 }, `parte${i} `);
        const { service, llm } = build(steps);
        const { sink, running } = await start(service);

        await jest.advanceTimersByTimeAsync(50_000);
        expect(llm.signals[0].aborted).toBe(false);
        expect(sink.deltas.length).toBeGreaterThanOrEqual(5);

        await jest.advanceTimersByTimeAsync(TOTAL_TIMEOUT_MS - 50_000);
        await running;

        expect(llm.signals[0].aborted).toBe(true);
        expect(sink.final?.status).toBe('ai_unavailable');
    });

    it('el embedding que no responde en 15 s da ai_unavailable, sin recuperar', async () => {
        const { service, retrieval } = build(['nunca'], 'hang');
        const { sink, running } = await start(service);

        await jest.advanceTimersByTimeAsync(EMBEDDING_TIMEOUT_MS);
        await running;

        expect(retrieval.calls).toBe(0);
        expect(sink.names).toEqual(['start', 'done']);
        expect(sink.final?.status).toBe('ai_unavailable');
    });

    it('E11: si el cliente corta a mitad, se corta el modelo, sin done, sin error y sin guardar', async () => {
        const { service, llm, repo } = build(['El plazo ', { wait: 5_000 }, 'es de 5 días.']);
        const client = new AbortController();
        const { sink, running } = await start(service, client.signal);

        await jest.advanceTimersByTimeAsync(2_000);
        client.abort();
        await jest.advanceTimersByTimeAsync(10_000);
        await running;

        expect(llm.signals[0].aborted).toBe(true);
        expect(sink.names).toEqual(['start', 'delta']);
        expect(repo.saved).toHaveLength(0);
    });

    it('si el cliente corta durante el embedding, no se llama al modelo ni se guarda', async () => {
        const { service, llm, repo } = build(['nunca'], 'hang');
        const client = new AbortController();
        const { sink, running } = await start(service, client.signal);

        client.abort();
        await jest.advanceTimersByTimeAsync(EMBEDDING_TIMEOUT_MS);
        await running;

        expect(llm.signals).toHaveLength(0);
        expect(sink.names).toEqual(['start']);
        expect(repo.saved).toHaveLength(0);
    });

    it('al terminar no quedan temporizadores pendientes', async () => {
        const { service } = build(['Respuesta ', 'completa [S1].']);
        const { running } = await start(service);

        await jest.advanceTimersByTimeAsync(0);
        await running;

        expect(jest.getTimerCount()).toBe(0);
    });
});

// Diagnóstico: cuando el corte por tiempo llega mientras el proveedor falla (cuota, alta demanda…),
// el log dice ese motivo; para el usuario no cambia nada (ai_unavailable, como siempre).
describe('ChatStreamService: el log dice el motivo real del proveedor', () => {
    class OverloadedLlm extends ChatLlm {
        async answer(): Promise<LlmAnswer> {
            throw new Error('no se usa');
        }
        stream(_q: string, _p: Passage[], signal: AbortSignal): LlmStream {
            const cut = new Promise<never>((_, reject) =>
                signal.addEventListener('abort', () =>
                    reject(new LlmCutError((signal.reason as Error).message, 'HTTP 503: high demand')),
                ),
            );
            cut.catch(() => undefined);
            async function* parts(): AsyncGenerator<string> {
                yield await cut;
            }
            return { textStream: parts(), final: cut };
        }
    }

    beforeEach(() => {
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
        jest.restoreAllMocks();
    });

    it('el aviso del log empieza por el error del proveedor, y done sigue siendo ai_unavailable', async () => {
        const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
        const repo = new FakeRepository();
        const service = new ChatStreamService(
            new FakeEmbeddings(),
            new FakeRetrieval([chunk()]),
            new OverloadedLlm(),
            repo,
        );
        const sink = new RecordingSink();
        const opened = await service.open(USER, { message: '¿Plazo?' });
        const running = service.run(USER, opened, sink, new AbortController().signal);

        await jest.advanceTimersByTimeAsync(FIRST_TEXT_TIMEOUT_MS);
        await running;

        expect(warn).toHaveBeenCalledWith(
            'Falló la llamada al modelo: LlmCutError: HTTP 503: high demand (pedido cortado: El modelo no empezó a responder a tiempo)',
        );
        expect(sink.final).toMatchObject({ status: 'ai_unavailable', answer: UNAVAILABLE_TEXT });
        expect(repo.saved[0].status).toBe('ai_unavailable');
    });
});
