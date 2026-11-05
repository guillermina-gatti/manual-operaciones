// Saludos y preguntas de presentación: se responden sin buscar en los documentos ni llamar al modelo.
export const GREETING_TEXT =
    '¡Hola! Soy el asistente del manual de operaciones. Preguntame sobre los procedimientos y documentos a los que tenés acceso, y te respondo citando la fuente.';

const GREETINGS = new Set([
    'hola',
    'buenas',
    'buenos dias',
    'buen dia',
    'buenas tardes',
    'buenas noches',
    'hey',
    'hi',
    'hello',
    'que tal',
    'como estas',
    'como andas',
    'que onda',
    'como puedo ayudarte',
    'que podes hacer',
    'ayuda',
    'quien sos',
]);

// Compara sin tildes, signos ni mayúsculas, y solo con el mensaje completo.
export function isGreeting(question: string): boolean {
    const normalized = question
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    return GREETINGS.has(normalized);
}