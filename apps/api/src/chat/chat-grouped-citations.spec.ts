// Spec 009 (ajuste del 12/11/2026): las citas agrupadas ("[S1, S2]") cuentan como citas separadas. Caso
// real con gemini-3.5-flash-lite: "Faltan dos bultos, ¿qué pongo al firmar el remito?". La respuesta
// citaba "[S1, S2]", "[S1]", "[S2]" y, en una nota, "[S4]", que no existía. "[S1, S2]" quedaba como texto, la
// verificación de cifras tomaba el 1 y el 2 como datos sin respaldo y done llegaba con no_info.
import { finishChat, splitGroupedCitations } from './chat-pipeline';
import { chunk } from './testing/chat-fakes';

const REMITO = [
    chunk({
        chunkId: 'c1',
        documentId: 'doc-recepcion',
        documentTitle: 'Manual de recepción de mercadería',
        section: 'Faltantes',
        content: 'Si falta mercadería, se anota en el remito la cantidad de bultos que faltan antes de firmar.',
    }),
    chunk({
        chunkId: 'c2',
        documentId: 'doc-recepcion',
        documentTitle: 'Manual de recepción de mercadería',
        section: 'Firma del remito',
        content: 'Se firma con la aclaración "Recibido con faltantes" y se avisa al supervisor.',
    }),
    chunk({ chunkId: 'c3', documentId: 'doc-danos', content: 'La mercadería dañada se separa y se fotografía.' }),
];

const answerOf = (text: string) => ({ text, modelName: 'fake-model', inputTokens: 10, outputTokens: 5 });

describe('splitGroupedCitations', () => {
    it.each([
        ['[S1, S2]', '[S1] [S2]'],
        ['[S1,S2]', '[S1] [S2]'],
        ['[ S1 ; S2 ; S3 ]', '[S1] [S2] [S3]'],
        ['firmá [S1, S12].', 'firmá [S1] [S12].'],
    ])('"%s" → "%s"', (input, output) => {
        expect(splitGroupedCitations(input)).toBe(output);
    });

    it.each([['[S1]'], ['[S1][S2]'], ['[1, 2]'], ['[S1 y S2]'], ['quedan 2, 3 bultos']])(
        'no toca "%s"',
        (text) => {
            expect(splitGroupedCitations(text)).toBe(text);
        },
    );
});

describe('finishChat con citas agrupadas (spec 009, ajuste del 12/11/2026)', () => {
    it('el caso del remito: answered, sin la cita inexistente y con las fuentes S1 y S2', () => {
        const text =
            'Anotá en el remito los bultos que faltan y firmá con "Recibido con faltantes" [S1, S2]. ' +
            'Primero contá lo que llegó [S1] y después avisá al supervisor [S2].\n\nNota: guardá una copia del remito [S4].';

        const outcome = finishChat(answerOf(text), REMITO);

        expect(outcome.status).toBe('answered');
        expect(outcome.answer).toBe(
            'Anotá en el remito los bultos que faltan y firmá con "Recibido con faltantes" [S1] [S2]. ' +
                'Primero contá lo que llegó [S1] y después avisá al supervisor [S2].\n\nNota: guardá una copia del remito.',
        );
        expect(outcome.chunks.map((c) => c.chunkId)).toEqual(['c1', 'c2']);
    });

    it('"[S1][S2]" son dos citas', () => {
        const outcome = finishChat(answerOf('Firmá con la aclaración [S1][S2].'), REMITO);

        expect(outcome).toMatchObject({ status: 'answered', answer: 'Firmá con la aclaración [S1][S2].' });
        expect(outcome.chunks.map((c) => c.chunkId)).toEqual(['c1', 'c2']);
    });

    it('en un grupo con una cita inexistente, queda la válida', () => {
        const outcome = finishChat(answerOf('Anotá los bultos que faltan [S1, S9].'), REMITO);

        expect(outcome).toMatchObject({ status: 'answered', answer: 'Anotá los bultos que faltan [S1].' });
        expect(outcome.chunks.map((c) => c.chunkId)).toEqual(['c1']);
    });

    it('si ninguna cita del grupo es válida, no_info (la regla de HU18 sigue)', () => {
        expect(finishChat(answerOf('Anotá los bultos que faltan [S7, S9].'), REMITO).status).toBe('no_info');
    });

    it('la verificación de cifras sigue: una cifra que no está en los pasajes citados es no_info', () => {
        const outcome = finishChat(answerOf('Esperá 48 horas antes de firmar [S1, S2].'), REMITO);

        expect(outcome.status).toBe('no_info');
    });

    it('en la explicación de una contradicción, el grupo también se separa (spec 011, R7)', () => {
        const outcome = finishChat(
            answerOf('CONFLICT [S1] [S3]\nUno dice anotar [S1, S2]; el otro, separar [S3].'),
            REMITO,
        );

        expect(outcome).toMatchObject({ status: 'conflict', answer: 'Uno dice anotar [S1]; el otro, separar [S3].' });
    });
});
