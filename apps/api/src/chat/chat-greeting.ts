// Saludos y preguntas de presentación: se responden sin buscar en los documentos ni llamar al modelo.
export const GREETING_TEXT =
    '¡Hola! Soy el asistente del manual de operaciones. Preguntame sobre los procedimientos y documentos a los que tenés acceso, y te respondo citando la fuente.';

// Mensajes que son solo un saludo o una pregunta de presentación.
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

// Saludos que pueden abrir un mensaje seguido de una frase de cortesía.
const OPENERS = new Set([
    'hola',
    'buenas',
    'buenos dias',
    'buen dia',
    'buenas tardes',
    'buenas noches',
    'hey',
    'hi',
    'hello',
]);

// Frases de cortesía que, después de un saludo, no piden nada del manual.
const COURTESY = new Set(['como estas', 'como andas', 'que tal', 'todo bien', 'como va']);

// Compara sin tildes, signos ni mayúsculas.
function normalize(text: string): string {
    return text
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

// Es un saludo si es una frase de saludo sola, o un saludo seguido solo de una frase de cortesía.
// Si después del saludo hay una consulta ("hola, cómo cargo un PDF"), no es un saludo.
export function isGreeting(question: string): boolean {
    const normalized = normalize(question);
    if (GREETINGS.has(normalized)) return true;

    for (const opener of OPENERS) {
        if (normalized.startsWith(`${opener} `)) {
            const rest = normalized.slice(opener.length + 1);
            if (COURTESY.has(rest)) return true;
        }
    }
    return false;
}