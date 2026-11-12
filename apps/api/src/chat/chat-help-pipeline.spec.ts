// La ayuda de la plataforma en prepareChat: respuesta fija, sin embedding, sin búsqueda y sin modelo.
import { Logger } from '@nestjs/common';
import { prepareChat } from './chat-pipeline';
import { FakeEmbeddings, FakeRetrieval, USER, chunk } from './testing/chat-fakes';

describe('prepareChat: ayuda de la plataforma', () => {
    const logger = new Logger('test');

    it('una pregunta de ayuda sin documentos que la respondan se responde con el texto fijo', async () => {
        const embeddings = new FakeEmbeddings();
        const retrieval = new FakeRetrieval([]);

        const prepared = await prepareChat(embeddings, retrieval, USER, '¿Cómo veo un documento?', logger);

        if (prepared.kind !== 'done') throw new Error('se esperaba un resultado final');
        expect(prepared.outcome.status).toBe('answered');
        expect(prepared.outcome.chunks).toEqual([]);
        expect(prepared.outcome.answer).toContain('/documentos');
        expect(retrieval.calls).toBe(1);
    });

    it('si los documentos sí responden, una pregunta de ayuda va a la búsqueda', async () => {
        const embeddings = new FakeEmbeddings();
        const retrieval = new FakeRetrieval([chunk()]);

        const prepared = await prepareChat(embeddings, retrieval, USER, '¿Cómo veo un documento?', logger);

        expect(prepared.kind).toBe('ready');
        expect(retrieval.calls).toBe(1);
    });

    it('una pregunta de trabajo con "cómo" va a la búsqueda aunque tenga palabras parecidas a las de la app', async () => {
        const embeddings = new FakeEmbeddings();
        const retrieval = new FakeRetrieval([chunk()]);

        const prepared = await prepareChat(
            embeddings,
            retrieval,
            USER,
            'Pagó con crédito en cuotas, ¿cómo le devuelvo la plata?',
            logger,
        );

        expect(prepared.kind).toBe('ready');
        expect(retrieval.calls).toBe(1);
    });

    it('sin áreas asignadas no hay ayuda: sigue valiendo la regla de no_info', async () => {
        const embeddings = new FakeEmbeddings();
        const retrieval = new FakeRetrieval([chunk()]);

        const prepared = await prepareChat(
            embeddings,
            retrieval,
            { id: 'u', areaIds: [] },
            '¿Cómo veo un documento?',
            logger,
        );

        if (prepared.kind !== 'done') throw new Error('se esperaba un resultado final');
        expect(prepared.outcome.status).toBe('no_info');
        expect(embeddings.calls).toBe(0);
    });
});

describe('prepareChat: "ayuda" sola', () => {
    it('responde el menú de temas, sin embedding ni búsqueda', async () => {
        const embeddings = new FakeEmbeddings();
        const retrieval = new FakeRetrieval([chunk()]);

        const prepared = await prepareChat(embeddings, retrieval, USER, 'ayuda', new Logger('test'));

        if (prepared.kind !== 'done') throw new Error('se esperaba un resultado final');
        expect(prepared.outcome.status).toBe('answered');
        expect(prepared.outcome.answer).toContain('Puedo ayudarte con');
        expect(embeddings.calls).toBe(0);
        expect(retrieval.calls).toBe(0);
    });
});

describe('prepareChat: preguntas de trabajo reales van a la búsqueda (regresión)', () => {
    it.each([
        'Pagó con crédito en cuotas, ¿cómo le devuelvo la plata?',
        'El producto no tiene la caja original, ¿igual lo acepto?',
        'Pagó 150.000 pesos en efectivo, ¿se los devuelvo yo?',
    ])('"%s" se busca en los documentos, sin respuesta de ayuda', async (question) => {
        const embeddings = new FakeEmbeddings();
        const retrieval = new FakeRetrieval([chunk()]);

        const prepared = await prepareChat(embeddings, retrieval, USER, question, new Logger('test'));

        expect(prepared.kind).toBe('ready');
        expect(retrieval.calls).toBe(1);
    });
});