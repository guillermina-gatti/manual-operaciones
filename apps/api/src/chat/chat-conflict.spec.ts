// Spec 011 (T02): la marca de contradicción del asistente, "CONFLICT [Sx] [Sy]" en la primera línea.
import {
    CONFLICT_MARKER,
    answerChecked,
    bothAnswers,
    checkMarkerLine,
    keepOnlyRefs,
    readConflictMarker,
    recordConflictAlert,
    sameDocumentRefs,
    withoutMarkerLine,
} from './chat-conflict';
import type { Outcome } from './chat-pipeline';
import { FakeConflictAlertRecorder, FakeLlm, chunk } from './testing/chat-fakes';

// Seis pasajes: S1 y S2 del Manual de compras, S3 de la Política de gastos y S4 a S6 de otros.
const CHUNKS = [
    chunk({ chunkId: 'c1', documentId: 'doc-compras' }),
    chunk({ chunkId: 'c2', documentId: 'doc-compras' }),
    chunk({ chunkId: 'c3', documentId: 'doc-gastos', documentTitle: 'Política de gastos' }),
    chunk({ chunkId: 'c4', documentId: 'doc-4' }),
    chunk({ chunkId: 'c5', documentId: 'doc-5' }),
    chunk({ chunkId: 'c6', documentId: 'doc-6' }),
];
const BODY = 'El manual dice que aprueba el gerente [S1]; la política, que el director [S3].';

describe('readConflictMarker (R5, R6)', () => {
    it('E1: una marca válida da los dos pasajes y la explicación', () => {
        const reading = readConflictMarker(`CONFLICT [S1] [S3]\n${BODY}`, CHUNKS);

        expect(reading).toEqual({ kind: 'conflict', first: CHUNKS[0], second: CHUNKS[2], body: BODY });
    });

    it('los pasajes quedan en el orden de su número, aunque la marca los dé al revés', () => {
        const reading = readConflictMarker(`CONFLICT [S3] [S1]\n${BODY}`, CHUNKS);

        expect(reading).toMatchObject({ kind: 'conflict', first: CHUNKS[0], second: CHUNKS[2] });
    });

    it('ignora los espacios y saltos de línea iniciales, y los finales de la línea', () => {
        const reading = readConflictMarker(`\n  CONFLICT [S1] [S3]  \r\n\n${BODY}\n`, CHUNKS);

        expect(reading).toMatchObject({ kind: 'conflict', body: BODY });
    });

    it('E6: dos pasajes del mismo documento son una marca inválida', () => {
        const reading = readConflictMarker(`CONFLICT [S1] [S2]\n${BODY}`, CHUNKS);

        expect(reading).toEqual({ kind: 'invalid', body: BODY, reason: expect.stringContaining('mismo documento') });
    });

    it.each([
        ['el mismo pasaje dos veces', `CONFLICT [S1] [S1]\n${BODY}`],
        ['un pasaje que no existe', `CONFLICT [S1] [S9]\n${BODY}`],
        ['el pasaje 0', `CONFLICT [S0] [S1]\n${BODY}`],
        ['texto de más en la línea', `CONFLICT [S1] [S3] entre el manual y la política\n${BODY}`],
        ['tres pasajes', `CONFLICT [S1] [S3] [S4]\n${BODY}`],
        ['sin espacio entre las marcas', `CONFLICT [S1][S3]\n${BODY}`],
        ['sin marcas', `CONFLICT\n${BODY}`],
        ['la marca en minúsculas después de CONFLICT', `CONFLICT [s1] [s3]\n${BODY}`],
    ])('es inválida con %s', (_case, text) => {
        expect(readConflictMarker(text, CHUNKS)).toMatchObject({ kind: 'invalid', body: BODY });
    });

    it('sin explicación es inválida, con el cuerpo vacío', () => {
        expect(readConflictMarker('CONFLICT [S1] [S3]', CHUNKS)).toMatchObject({ kind: 'invalid', body: '' });
        expect(readConflictMarker('CONFLICT [S1] [S3]\n   \n', CHUNKS)).toMatchObject({ kind: 'invalid', body: '' });
    });

    it.each([
        ['una respuesta común', `Lo aprueba el gerente [S1].`],
        ['la marca NO_INFO', 'NO_INFO'],
        ['una palabra que empieza parecido', 'Consultá con tu supervisor [S1].'],
        ['la marca en minúsculas', `conflict [S1] [S3]\n${BODY}`],
        ['la marca en el medio del texto', `Hay algo raro.\nCONFLICT [S1] [S3]\n${BODY}`],
        ['una palabra que empieza con la marca', 'CONFLICTIVO es el caso [S1].'],
    ])('%s no es una marca', (_case, text) => {
        expect(readConflictMarker(text, CHUNKS)).toEqual({ kind: 'none' });
    });

    it('la marca es CONFLICT', () => {
        expect(CONFLICT_MARKER).toBe('CONFLICT');
    });
});

// Ajuste del 11/11/2026: la marca entre dos pasajes del mismo documento se reconoce aparte, para
// pedirle la respuesta otra vez al modelo (en las dos rutas).
describe('la marca entre pasajes del mismo documento (ajuste del 11/11/2026)', () => {
    it('checkMarkerLine da los dos pasajes en sameDocument, en el orden de su número', () => {
        expect(checkMarkerLine('CONFLICT [S2] [S1]', CHUNKS)).toEqual({
            ok: false,
            reason: expect.stringContaining('mismo documento'),
            sameDocument: [1, 2],
        });
    });

    it('sameDocumentRefs: solo con la marca entre pasajes del mismo documento', () => {
        expect(sameDocumentRefs(`CONFLICT [S1] [S2]\n${BODY}`, CHUNKS)).toEqual([1, 2]);
        expect(sameDocumentRefs('CONFLICT [S1] [S2]', CHUNKS)).toEqual([1, 2]);
        expect(sameDocumentRefs(`CONFLICT [S1] [S3]\n${BODY}`, CHUNKS)).toBeNull();
        expect(sameDocumentRefs(`CONFLICT [S1] [S9]\n${BODY}`, CHUNKS)).toBeNull();
        expect(sameDocumentRefs(`CONFLICT [S1] [S1]\n${BODY}`, CHUNKS)).toBeNull();
        expect(sameDocumentRefs(BODY, CHUNKS)).toBeNull();
    });

    // Ajuste del 12/11/2026: el segundo pedido no responde con una marca; se saca su línea.
    it('withoutMarkerLine: saca la línea de la marca, sea válida o no, y deja el resto', () => {
        expect(withoutMarkerLine(`CONFLICT [S1] [S2]\n${BODY}`)).toBe(BODY);
        expect(withoutMarkerLine(`  CONFLICT [S1] [S3]\n\n${BODY}`)).toBe(BODY);
        expect(withoutMarkerLine('CONFLICT [S1] [S2]')).toBe('');
        expect(withoutMarkerLine(BODY)).toBe(BODY);
        expect(withoutMarkerLine('CONFLICTIVO es el caso [S1].')).toBe('CONFLICTIVO es el caso [S1].');
        expect(bothAnswers({ text: 'uno', modelName: 'm' }, { text: `CONFLICT [S1] [S2]\n${BODY}`, modelName: 'm' }).text).toBe(BODY);
    });

    it('bothAnswers: el texto y el modelo del segundo, con los tokens sumados', () => {
        const first = { text: 'uno', modelName: 'm', inputTokens: 400, outputTokens: 200 };
        const second = { text: 'dos', modelName: 'm', inputTokens: 420, outputTokens: 60 };

        expect(bothAnswers(first, second)).toEqual({ text: 'dos', modelName: 'm', inputTokens: 820, outputTokens: 260 });
        expect(bothAnswers({ text: 'uno', modelName: 'm' }, { text: 'dos', modelName: 'm' })).toEqual({
            text: 'dos',
            modelName: 'm',
            inputTokens: undefined,
            outputTokens: undefined,
        });
    });

    describe('answerChecked (POST /api/chat)', () => {
        const prepared = {
            chunks: CHUNKS.slice(0, 3),
            passages: CHUNKS.slice(0, 3).map((c, i) => ({
                ref: `S${i + 1}`,
                documentTitle: c.documentTitle,
                section: c.section,
                content: c.content,
                documentId: c.documentId,
            })),
        };
        const logger = { warn: jest.fn() };

        beforeEach(() => logger.warn.mockClear());

        it('sin la marca del mismo documento, un solo pedido', async () => {
            const llm = new FakeLlm([`CONFLICT [S1] [S3]\n${BODY}`]);

            const answer = await answerChecked(llm, '¿Quién aprueba?', prepared, logger);

            expect(llm.options).toEqual([undefined]);
            expect(answer.text).toBe(`CONFLICT [S1] [S3]\n${BODY}`);
            expect(logger.warn).not.toHaveBeenCalled();
        });

        it('con la marca del mismo documento, un segundo pedido con el aviso y los tokens sumados', async () => {
            const llm = new FakeLlm([`CONFLICT [S1] [S2]\n${BODY}`], ['Lo aprueba el gerente [S1].']);
            const context = {
                procedureVersionId: 'v',
                stepId: 's',
                procedureTitle: 'Compras',
                stepOrder: 1,
                stepTitle: 'Aprobar',
                stepDescription: '',
            };

            const answer = await answerChecked(llm, '¿Quién aprueba?', prepared, logger, context);

            expect(llm.options).toEqual([undefined, { sameDocumentRefs: ['S1', 'S2'] }]);
            expect(llm.contexts).toEqual([context, context]);
            expect(answer).toEqual({
                text: 'Lo aprueba el gerente [S1].',
                modelName: 'fake-model',
                inputTokens: 20,
                outputTokens: 10,
            });
            expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('entre S1 y S2, del mismo documento'));
        });

        // Ajuste del 12/11/2026: si el segundo vuelve a marcar, se saca la línea y queda su resto.
        it('una sola vez; si el segundo vuelve a marcar, sin la línea de la marca', async () => {
            const llm = new FakeLlm([`CONFLICT [S1] [S2]\n${BODY}`]);

            const answer = await answerChecked(llm, '¿Quién aprueba?', prepared, logger);

            expect(llm.options).toHaveLength(2);
            expect(answer.text).toBe(BODY);
            expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('El segundo pedido volvió con una marca CONFLICT'));
        });

        it('si falla el segundo, queda el primero, y el error en el log', async () => {
            const llm = new FakeLlm([`CONFLICT [S1] [S2]\n${BODY}`], [{ fail: 'quota' }]);

            const answer = await answerChecked(llm, '¿Quién aprueba?', prepared, logger);

            expect(answer).toEqual({
                text: `CONFLICT [S1] [S2]\n${BODY}`,
                modelName: 'fake-model',
                inputTokens: 10,
                outputTokens: 5,
            });
            expect(logger.warn).toHaveBeenLastCalledWith(expect.stringContaining('quota'));
        });

        it('si falla el primero, el error sale (ai_unavailable, como siempre)', async () => {
            const llm = new FakeLlm(null);

            await expect(answerChecked(llm, '¿Quién aprueba?', prepared, logger)).rejects.toThrow('model down');
        });
    });
});

describe('keepOnlyRefs (R7)', () => {
    it('quita las marcas de otros pasajes y deja las dos de la contradicción', () => {
        expect(keepOnlyRefs('Gerente [S1], director [S3], y además [S4].', [1, 3])).toBe(
            'Gerente [S1], director [S3], y además.',
        );
    });

    it('no toca un texto que solo cita los dos pasajes', () => {
        expect(keepOnlyRefs(BODY, [1, 3])).toBe(BODY);
    });

    it('no confunde S1 con S12', () => {
        expect(keepOnlyRefs('Uno [S1] y doce [S12].', [1, 3])).toBe('Uno [S1] y doce.');
    });
});

// Spec 011 (T06, R12): después de saveResult, la alerta, solo con conflict. Un error no se propaga.
describe('recordConflictAlert (R12)', () => {
    const first = CHUNKS[0];
    const second = CHUNKS[2];
    const conflictOutcome: Outcome = {
        status: 'conflict',
        answer: BODY,
        chunks: [first, second],
        conflict: { first, second },
    };
    const result = { conversationId: 'conv-1', messageId: 'msg-1', status: 'conflict' as const, answer: BODY, sources: [] };
    const logger = () => ({ error: jest.fn(), warn: jest.fn() });

    it('E1: con conflict le pasa el mensaje, la pregunta y los dos fragmentos', async () => {
        const recorder = new FakeConflictAlertRecorder();

        await recordConflictAlert(recorder, conflictOutcome, result, '¿Quién aprueba?', logger());

        expect(recorder.recorded).toEqual([{ messageId: 'msg-1', question: '¿Quién aprueba?', first, second }]);
    });

    it('E17: sin conflict no llama al recorder', async () => {
        const recorder = new FakeConflictAlertRecorder();
        const answered: Outcome = { status: 'answered', answer: 'Sí [S1].', chunks: [first] };

        await recordConflictAlert(recorder, answered, { ...result, status: 'answered' }, '¿Quién?', logger());

        expect(recorder.recorded).toEqual([]);
    });

    it('E16: si falla, queda en el log con los dos documentos y no se propaga', async () => {
        const recorder = new FakeConflictAlertRecorder();
        recorder.failure = new Error('db down');
        const log = logger();

        await expect(recordConflictAlert(recorder, conflictOutcome, result, '¿Quién?', log)).resolves.toBeUndefined();
        expect(log.error).toHaveBeenCalledWith(expect.stringContaining('db down'));
        expect(log.error).toHaveBeenCalledWith(expect.stringContaining('doc-compras'));
        expect(log.error).toHaveBeenCalledWith(expect.stringContaining('doc-gastos'));
    });

    it('sin recorder, un warn y nada más', async () => {
        const log = logger();

        await recordConflictAlert(undefined, conflictOutcome, result, '¿Quién?', log);

        expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('sin registrar'));
    });
});
