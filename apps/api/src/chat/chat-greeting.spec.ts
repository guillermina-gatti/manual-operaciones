import { GREETING_TEXT, isGreeting } from './chat-greeting';

describe('isGreeting', () => {
    it.each(['hola', 'Hola!', '¡Hola!', 'Buenos días', '¿Cómo estás?', 'hey'])(
        'reconoce el saludo "%s"',
        (question) => {
            expect(isGreeting(question)).toBe(true);
        },
    );

    it.each([
        'hola, como estas?',
        'Hola, ¿cómo estás?',
        'hola, cómo andás',
        'buenas tardes, qué tal',
        'hola, todo bien?',
    ])('reconoce el saludo con cortesía "%s"', (question) => {
        expect(isGreeting(question)).toBe(true);
    });

    it.each([
        'cómo cargo un documento',
        'hola, cómo cargo un PDF',
        'hola, cómo estás? estoy buscando un documento',
        'hola, ¿cuál es el plazo de envío?',
        'procedimiento de envíos',
    ])('no toma "%s" como saludo', (question) => {
        expect(isGreeting(question)).toBe(false);
    });

    it('responde con un texto de presentación', () => {
        expect(GREETING_TEXT).toContain('asistente');
    });
});