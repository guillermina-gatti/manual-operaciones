// Área nombrada en la pregunta: detección y que la búsqueda se limite a esa área.
import { Logger } from '@nestjs/common';
import { focusAreaOf } from './chat-area';
import { prepareChat } from './chat-pipeline';
import { ChatRetrieval, type RetrievedChunk } from './ports/chat-retrieval';
import { FakeEmbeddings, USER, chunk } from './testing/chat-fakes';

class SpyRetrieval extends ChatRetrieval {
    focus: Array<string | undefined> = [];
    constructor(private readonly rows: RetrievedChunk[]) {
        super();
    }
    async search(_v: number[], _areas: string[] | null, _limit: number, focusArea?: string) {
        this.focus.push(focusArea);
        return this.rows;
    }
}

describe('focusAreaOf', () => {
    it('reconoce el área aunque la escriban sin tildes o en minúscula', () => {
        expect(focusAreaOf('es para el area de operaciones')).toBe('Operaciones');
        expect(focusAreaOf('¿Cuánto dura la vigencia en Ventas?')).toBe('Ventas');
        expect(focusAreaOf('¿Qué pasa en Atencion al cliente?')).toBe('Atención al cliente');
    });

    it('no toma como área una pregunta sin área', () => {
        expect(focusAreaOf('¿Dónde veo las métricas?')).toBeNull();
    });
});

describe('prepareChat: área nombrada', () => {
    const logger = new Logger('test');

    it('pasa el área a la búsqueda cuando la pregunta la nombra', async () => {
        const retrieval = new SpyRetrieval([chunk()]);
        await prepareChat(new FakeEmbeddings(), retrieval, USER, '¿Qué pasa con los pedidos en Operaciones?', logger);
        expect(retrieval.focus).toEqual(['Operaciones']);
    });

    it('sin área en la pregunta, la búsqueda no se limita', async () => {
        const retrieval = new SpyRetrieval([chunk()]);
        await prepareChat(new FakeEmbeddings(), retrieval, USER, '¿Cuál es el horario de corte?', logger);
        expect(retrieval.focus).toEqual([undefined]);
    });

    it('si el área no tiene nada vigente, dice de qué área es', async () => {
        const retrieval = new SpyRetrieval([]);
        const prepared = await prepareChat(new FakeEmbeddings(), retrieval, USER, '¿Cuánto dura la garantía en Operaciones?', logger);
        if (prepared.kind !== 'done') throw new Error('se esperaba un resultado final');
        expect(prepared.outcome.status).toBe('no_info');
        expect(prepared.outcome.answer).toContain('área Operaciones');
    });
});