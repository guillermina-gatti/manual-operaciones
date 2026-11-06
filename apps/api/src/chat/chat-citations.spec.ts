// Limpieza de citas (pedido de Mati): las [Sn] que no corresponden a un fragmento se quitan del done,
// y sin ninguna cita válida la respuesta es no_info.
import { cleanCitations, finishChat } from './chat-pipeline';
import { chunk } from './testing/chat-fakes';

describe('cleanCitations', () => {
    it('deja las citas válidas y quita las que no existen', () => {
        const out = cleanCitations('El plazo es 5 días [S1]. Ver también [S7].', 2);
        expect(out.text).toBe('El plazo es 5 días [S1]. Ver también.');
        expect([...out.refs]).toEqual([1]);
    });

    it('sin citas válidas devuelve conjunto vacío', () => {
        expect(cleanCitations('Respuesta sin fuente [S0] [S9]', 2).refs.size).toBe(0);
    });
});

describe('finishChat con citas', () => {
    const chunks = [chunk({ chunkId: 'a' }), chunk({ chunkId: 'b' })];

    it('responde limpio cuando hay una cita válida', () => {
        const outcome = finishChat({ text: 'Respuesta [S2] [S5]' } as never, chunks);
        expect(outcome.status).toBe('answered');
        expect(outcome.answer).toBe('Respuesta [S2]');
    });

    it('sin ninguna cita válida, no_info', () => {
        const outcome = finishChat({ text: 'Respuesta sin cita' } as never, chunks);
        expect(outcome.status).toBe('no_info');
    });
});