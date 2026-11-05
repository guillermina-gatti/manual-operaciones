import { smallTalkReply } from './chat-greeting';

const first = () => 0;

describe('smallTalkReply: saludos', () => {
    it.each(['hola', 'Hola!', '¡Hola!', 'Buenos días', '¿Cómo estás?', 'hey', 'hii', 'holaaa', 'hellooo'])(
        'saluda a "%s"',
        (question) => {
            expect(smallTalkReply(question, first)).not.toBeNull();
        },
    );

    it.each([
        'hola, como estas?',
        'Hola, ¿cómo estás?',
        'hola, cómo andás',
        'buenas tardes, qué tal',
        'hola, todo bien?',
    ])('saluda con cortesía "%s"', (question) => {
        expect(smallTalkReply(question, first)).not.toBeNull();
    });
});

describe('smallTalkReply: despedidas y agradecimientos', () => {
    it.each(['chau', 'Chau!', 'adiós', 'hasta luego', 'nos vemos', 'chau gracias'])(
        'se despide con "%s"',
        (question) => {
            expect(smallTalkReply(question, first)).toMatch(/Chau|Hasta luego|Nos vemos/);
        },
    );

    it.each(['gracias', 'muchas gracias'])('agradece con "%s"', (question) => {
        expect(smallTalkReply(question, first)).toMatch(/De nada|Un gusto/);
    });
});

describe('smallTalkReply: preguntas sobre el asistente', () => {
    it.each(['quién sos?', 'qué podés hacer', 'para qué sirves', 'cómo te llamas'])(
        'responde "%s"',
        (question) => {
            expect(smallTalkReply(question, first)).toMatch(/asistente del manual/);
        },
    );
});

describe('smallTalkReply: consultas que van a los documentos', () => {
    it.each([
        'cómo cargo un documento',
        'hola, cómo cargo un PDF',
        'hola, cómo estás? estoy buscando un documento',
        'hola, ¿cuál es el plazo de envío?',
        'procedimiento de envíos',
    ])('no responde charla a "%s"', (question) => {
        expect(smallTalkReply(question, first)).toBeNull();
    });
});