// Charla básica: saludos, despedidas, agradecimientos y preguntas sobre el asistente.
// Se responde con un texto fijo, sin buscar en los documentos ni llamar al modelo.

const GREETING_REPLIES = [
    '¡Hola! ¿Cómo estás? Estoy para ayudarte con los procedimientos y documentos del manual. ¿Qué necesitás?',
    '¡Hola! Muy bien, gracias por preguntar. Contame qué necesitás del manual de operaciones.',
    '¡Buenas! Acá estoy para ayudarte con los procedimientos y documentos de tu área. ¿En qué te doy una mano?',
    '¡Hola, qué gusto! Podés preguntarme lo que necesites sobre los procedimientos y documentos a los que tenés acceso.',
];

const FAREWELL_REPLIES = [
    '¡Chau! Que tengas un buen día. Cuando necesites algo del manual, acá estoy.',
    '¡Hasta luego! Si tenés otra duda sobre los procedimientos, volvé cuando quieras.',
    '¡Nos vemos! Buen trabajo hoy.',
];

const THANKS_REPLIES = [
    '¡De nada! Para eso estoy. ¿Necesitás algo más?',
    '¡Un gusto ayudarte! Si tenés otra consulta, preguntame.',
];

const ABOUT_REPLY =
    'Soy el asistente del manual de operaciones. Puedo responder preguntas sobre los procedimientos y documentos a los que tenés acceso, y te muestro la fuente de cada respuesta. Por ejemplo: "¿cómo cargo un documento?".';

// Preguntas por el asistente: se reconocen por palabras clave, así que no importa el resto de la frase.
// Las palabras van ya normalizadas: "llamas" se escribe "lamas" porque normalize() reduce la "ll" a "l".
const ABOUT_KEYWORDS = [
    ['quien', 'sos'],
    ['que', 'sos'],
    ['como', 'lamas'],
    ['que', 'podes', 'hacer'],
    ['para', 'que', 'sirves'],
    ['como', 'funcionas'],
];

const MAX_ABOUT_TOKENS = 5;

const FAREWELL_WORDS = new Set(['chau', 'adios', 'bye', 'vemos', 'luego', 'pronto']);
const THANKS_WORDS = new Set(['gracias', 'muchas', 'mil']);
const GREETING_WORDS = new Set([
    'hola', 'hey', 'hi', 'helo', 'buenas', 'buen', 'buenos', 'dia', 'dias', 'tardes', 'noches',
    'como', 'estas', 'andas', 'que', 'tal', 'onda', 'todo', 'bien', 'va', 'nos', 'hasta', 'muy',
]);
// Palabras que pueden formar charla. Si un mensaje tiene alguna que no esté acá, es una consulta.
const VOCABULARY = new Set([...FAREWELL_WORDS, ...THANKS_WORDS, ...GREETING_WORDS]);
// Para que un mensaje cuente como charla, tiene que tener al menos una de estas palabras fuertes.
const STRONG_WORDS = new Set([
    'hola', 'hey', 'hi', 'helo', 'buenas', 'buen', 'buenos', 'tardes', 'noches', 'dias',
    'chau', 'adios', 'bye', 'gracias', 'vemos', 'luego', 'pronto', 'estas', 'andas', 'onda', 'tal',
]);

// Sin tildes, signos ni mayúsculas. Las letras repetidas se reducen a una ("holaaa" -> "hola", "hii" -> "hi").
// Esto solo sirve para detectar charla; la búsqueda en documentos usa el texto original.
function normalize(text: string): string {
    return text
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z\s]/g, '')
        .replace(/(.)\1+/g, '$1')
        .replace(/\s+/g, ' ')
        .trim();
}

function pick(list: string[], random: () => number): string {
    const index = Math.min(Math.floor(random() * list.length), list.length - 1);
    return list[index];
}

// Devuelve la respuesta de charla para el mensaje, o null si es una consulta que hay que buscar.
// El parámetro random permite probar la elección de forma determinística.
export function smallTalkReply(question: string, random: () => number = Math.random): string | null {
    const normalized = normalize(question);
    if (!normalized) return null;

    const tokens = normalized.split(' ');
    // Solo una pregunta corta sobre el asistente. Con más palabras, "qué sos capaz de responder sobre
    // devoluciones" es una consulta de trabajo y tiene que ir a los documentos.
    if (
        tokens.length <= MAX_ABOUT_TOKENS &&
        ABOUT_KEYWORDS.some((keywords) => keywords.every((word) => tokens.includes(word)))
    ) {
        return ABOUT_REPLY;
    }

    if (!tokens.every((token) => VOCABULARY.has(token))) return null;
    if (!tokens.some((token) => STRONG_WORDS.has(token))) return null;

    if (tokens.some((token) => FAREWELL_WORDS.has(token))) return pick(FAREWELL_REPLIES, random);
    if (tokens.some((token) => THANKS_WORDS.has(token))) return pick(THANKS_REPLIES, random);
    return pick(GREETING_REPLIES, random);
}