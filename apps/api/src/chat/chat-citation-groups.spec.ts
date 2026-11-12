import type { RetrievedChunk } from './ports/chat-retrieval';
import type { LlmAnswer } from './ports/chat-llm';
import { finishChat, splitGroupedCitations } from './chat-pipeline';

// Fragmentos de prueba. Las cifras de la respuesta deben estar en los pasajes citados,
// si no la verificación de cifras devuelve no_info.
const chunks = [
    {
        documentId: 'doc-1',
        documentTitle: 'Políticas de compras',
        content: 'Las compras mayores a 100.000 requieren aprobación del supervisor.',
    },
    {
        documentId: 'doc-1',
        documentTitle: 'Políticas de compras',
        content: 'El plazo de entrega es de 5 días hábiles.',
    },
] as unknown as RetrievedChunk[];

const answer = (text: string): LlmAnswer => ({ text }) as never;

describe('splitGroupedCitations', () => {
    it('separa una marca con dos citas separadas por coma', () => {
        expect(splitGroupedCitations('El plazo es 5 días [S1, S2].')).toBe('El plazo es 5 días [S1] [S2].');
    });

    it('separa una marca con dos citas separadas por punto y coma', () => {
        expect(splitGroupedCitations('a [S1; S3] b [S2]')).toBe('a [S1] [S3] b [S2]');
    });

    it('deja igual las citas simples, las numeradas sin S y el texto sin citas', () => {
        expect(splitGroupedCitations('uno [S1][S2] dos')).toBe('uno [S1][S2] dos');
        expect(splitGroupedCitations('lista [1, 2]')).toBe('lista [1, 2]');
        expect(splitGroupedCitations('sin citas')).toBe('sin citas');
    });
});

describe('finishChat con citas agrupadas', () => {
    it('[S1, S2] responde con las dos citas', () => {
        const out = finishChat(
            answer('Las compras mayores a 100.000 requieren aprobación del supervisor y el plazo es de 5 días hábiles [S1, S2].'),
            chunks,
        );

        expect(out.status).toBe('answered');
        expect(out.answer).toBe(
            'Las compras mayores a 100.000 requieren aprobación del supervisor y el plazo es de 5 días hábiles [S1] [S2].',
        );
        expect(out.chunks).toHaveLength(2);
    });

    it('[S1, S4] con solo 2 fragmentos responde solo con [S1]', () => {
        const out = finishChat(answer('Las compras mayores a 100.000 requieren aprobación del supervisor [S1, S4].'), chunks);

        expect(out.status).toBe('answered');
        expect(out.answer).toBe('Las compras mayores a 100.000 requieren aprobación del supervisor [S1].');
        expect(out.chunks).toHaveLength(1);
        expect(out.chunks[0].documentTitle).toBe('Políticas de compras');
    });

    it('solo [S4], que no existe, da no_info', () => {
        const out = finishChat(answer('El plazo de entrega es de 5 días hábiles [S4].'), chunks);

        expect(out.status).toBe('no_info');
    });

    it('[S1, S2] con una cifra que no está en los pasajes citados da no_info', () => {
        const out = finishChat(answer('El plazo es de 900 días [S1, S2].'), chunks);

        expect(out.status).toBe('no_info');
    });

    it('las citas simples [S1][S2] siguen funcionando igual', () => {
        const out = finishChat(answer('Compras mayores a 100.000 requieren supervisor [S1]. Plazo de 5 días [S2].'), chunks);

        expect(out.status).toBe('answered');
        expect(out.chunks).toHaveLength(2);
    });
});