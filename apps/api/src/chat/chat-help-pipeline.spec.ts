// La ayuda de la plataforma en prepareChat: respuesta fija, sin embedding, sin búsqueda y sin modelo.
import { Logger } from '@nestjs/common';
import { prepareChat } from './chat-pipeline';
import { FakeEmbeddings, FakeRetrieval, USER, chunk } from './testing/chat-fakes';

describe('prepareChat: ayuda de la plataforma', () => {
    const logger = new Logger('test');

    it('una pregunta de ayuda se responde con el texto fijo, sin buscar ni calcular el embedding', async () => {
        const embeddings = new FakeEmbeddings();
        const retrieval = new FakeRetrieval([chunk()]);

        const prepared = await prepareChat(embeddings, retrieval, USER, '¿Cómo veo un documento?', logger);

        if (prepared.kind !== 'done') throw new Error('se esperaba un resultado final');
        expect(prepared.outcome.status).toBe('answered');
        expect(prepared.outcome.chunks).toEqual([]);
        expect(prepared.outcome.answer).toContain('/documentos');
        expect(embeddings.calls).toBe(0);
        expect(retrieval.calls).toBe(0);
    });

    it('una pregunta sobre el contenido de los documentos sigue yendo a la búsqueda', async () => {
        const embeddings = new FakeEmbeddings();
        const retrieval = new FakeRetrieval([chunk()]);

        const prepared = await prepareChat(embeddings, retrieval, USER, '¿Cuál es el plazo de devolución?', logger);

        expect(prepared.kind).toBe('ready');
        expect(embeddings.calls).toBe(1);
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