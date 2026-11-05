// Spec 011 (T02): la marca de contradicción del asistente, "CONFLICT [Sx] [Sy]" en la primera línea.
import { CONFLICT_MARKER, keepOnlyRefs, readConflictMarker, recordConflictAlert } from './chat-conflict';
import type { Outcome } from './chat-pipeline';
import { FakeConflictAlertRecorder, chunk } from './testing/chat-fakes';

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
