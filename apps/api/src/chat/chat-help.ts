// Ayuda sobre cómo usar la plataforma: "¿cómo veo un documento?", "¿dónde cargo un procedimiento?".
// Se responde con un texto fijo, sin buscar en los documentos ni llamar al modelo, igual que la charla
// básica (chat-greeting.ts). Así la respuesta no puede inventar pantallas ni pasos, no gasta cuota de
// Gemini y no necesita fuentes. El estado sigue siendo answered y sin fuentes.

// Sin tildes, signos ni mayúsculas. Solo sirve para detectar la intención; la búsqueda usa el texto original.
function normalize(text: string): string {
    return text
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

// Distancia de edición con transposición (Damerau), para perdonar errores de tipeo en palabras largas.
function distance(a: string, b: string): number {
    const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
    for (let j = 0; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) {
        for (let j = 1; j <= b.length; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
            if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
                d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
            }
        }
    }
    return d[a.length][b.length];
}

// Un token coincide con una raíz si es igual, o si empieza igual desde 4 letras ("docu" -> "documento").
// Los errores de tipeo solo se perdonan en raíces de 7 letras o más ("procedimeinto"). En las cortas el
// margen de una letra confunde palabras reales: "pago" con "paso", "original" con "origen".
function matches(token: string, stem: string): boolean {
    if (token === stem) return true;
    if (stem.length < 4) return false;
    if (token.startsWith(stem)) return true;
    return stem.length >= 7 && distance(token.slice(0, stem.length), stem) <= 1;
}

const has = (tokens: string[], stems: string[]) => tokens.some((t) => stems.some((s) => matches(t, s)));

// Palabras que muestran que la persona pregunta cómo se hace algo en la plataforma.
const INTENT = [
    'como', 'donde', 'puedo', 'quiero', 'necesito', 'hago', 'ayuda', 'veo', 'busc', 'encuentr',
    'carg', 'subo', 'subir', 'abr', 'ver', 'descarg', 'uso', 'ubic', 'acced', 'entr',
    'tengo', 'aparec', 'falta', 'signif', 'quiere', 'decir', 'demora', 'tard', 'cuando', 'sacas',
    'sacaste', 'verific', 'confi',
];

const DOCUMENT = ['docu', 'manual', 'archivo', 'pdf', 'instructivo'];

// Palabras de la app. Un tema de ayuda solo puede responder si la pregunta nombra alguna: sin ninguna, es
// una consulta de trabajo ("¿cómo le devuelvo la plata?") aunque tenga "cómo" y palabras parecidas.
const APP_TERMS = [
    ...DOCUMENT,
    'procedimient', 'ejecuc', 'ejecut', 'metric', 'estadistic', 'asistent', 'chat', 'fuente', 'cita',
    'respuest', 'estado', 'pendiente', 'procesand', 'listo',
];

interface Topic {
    name: string;
    // Cada grupo tiene que aparecer (alguna de sus raíces) para que el tema coincida.
    all: string[][];
    reply: string;
}

const VISIBLE_REPLY =
    'Solo ves los documentos vigentes de tus áreas: los de otras áreas, los archivados y las versiones reemplazadas no aparecen. Los administradores ven todos. Si falta uno que necesitás, pedile al administrador que te asigne el área o que lo cargue para la tuya.';

// Más específicos primero: el primero que coincide gana.
const TOPICS: Topic[] = [
    {
        name: 'documentos-visibles',
        all: [DOCUMENT, ['tengo', 'aparec', 'falta', 'acces', 'permis', 'visibl']],
        reply: VISIBLE_REPLY,
    },
    {
        name: 'documentos-visibles-no-veo',
        all: [DOCUMENT, ['no'], ['veo', 'encuentro', 'aparec']],
        reply: VISIBLE_REPLY,
    },
    {
        name: 'estados-documento',
        all: [
            ['pendiente', 'procesando', 'listo', 'error', 'estado'],
            ['signif', 'quiere', 'decir', 'demora', 'tard', 'cuando', 'estado'],
            [...DOCUMENT, 'signif', 'quiere', 'estado'],
        ],
        reply:
            'Cada documento pasa por estos estados: "Pendiente" (esperando en la cola), "Procesando" (se está leyendo y dividiendo en fragmentos), "Listo" (el asistente ya puede usarlo) y "Con error" (falló el procesamiento; el administrador lo ve en el detalle). El asistente solo responde con documentos en "Listo".',
    },
    {
        name: 'citas',
        all: [
            ['fuente', 'cita', 'respald'],
            [...INTENT, 'se', 'saber', 'confio'],
        ],
        reply:
            'Cada respuesta del asistente muestra al final de qué documento sacó la información: el título, la sección y desde cuándo está vigente, con un enlace al archivo. Si no encuentra nada en tus documentos, te lo dice en lugar de inventar una respuesta.',
    },
    {
        name: 'origen-respuesta',
        all: [['respuesta', 'contest'], ['sale', 'vien', 'origen', 'donde', 'de'], ['asistent', 'fuente', 'cita', 'chat', ...DOCUMENT]],
        reply:
            'Cada respuesta del asistente muestra al final de qué documento sacó la información: el título, la sección y desde cuándo está vigente, con un enlace al archivo. Si no encuentra nada en tus documentos, te lo dice en lugar de inventar una respuesta.',
    },
    {
        name: 'cargar-documento',
        all: [DOCUMENT, ['carg', 'subo', 'subir', 'subi', 'agreg']],
        reply:
            'Para cargar un documento tenés que ser administrador. Entrá a Documentos (/documentos) y elegí "Nuevo documento" (/documentos/nuevo): indicá el archivo (PDF, .txt o .md, hasta 10 MB), las áreas que pueden verlo, el responsable y la fecha de revisión. Cuando el estado diga "Listo", el asistente ya puede usarlo.',
    },
    {
        name: 'ver-documento',
        all: [DOCUMENT, ['ver', 'veo', 'busc', 'encuentr', 'abr', 'ubic', 'leer', 'consult', 'acced', 'descarg']],
        reply:
            'Entrá a Documentos (/documentos). Ahí ves los documentos de tus áreas y podés buscar por título o por contenido con el buscador de arriba. Abrí el que necesites para ver su detalle y descargarlo. Solo aparecen los documentos vigentes de tus áreas.',
    },
    {
        name: 'avisos-revision',
        all: [['venc', 'revis', 'alert', 'caduc', 'actualiz'], [...DOCUMENT, 'aviso', 'alert']],
        reply:
            'Cada documento tiene una fecha de revisión. Cuando se acerca o vence, el responsable recibe un aviso. Los documentos por revisar están en Documentos > "Por revisar" (/documentos/por-revisar) y las alertas, en /documentos/alertas.',
    },
    {
        name: 'ejecutar-procedimiento',
        all: [['procedimiento', 'ejecuc', 'ejecut'], ['como', 'donde', 'hago', 'empez', 'inici', 'marc', 'complet', 'veo', 'ver', 'abr', 'uso']],
        reply:
            'Los procedimientos de tus áreas están en Ejecuciones (/ejecuciones). Abrí uno para recorrerlo paso a paso y marcá cada paso al completarlo: si te interrumpen, retomás donde quedaste. Si tenés una duda en un paso, usá "¿Dudas con este paso?" y el asistente te responde con ese paso como contexto.',
    },
    {
        name: 'metricas',
        all: [['metric', 'estadistic'], INTENT],
        reply:
            'El panel de métricas está en Métricas (/metricas) y lo ven administradores y supervisores. Muestra el uso de los procedimientos, de los documentos y del asistente, y se puede filtrar por área y por fechas.',
    },
    {
        name: 'usar-asistente',
        all: [['asistente', 'chat', 'fuente', 'cita'], ['como', 'donde', 'funciona', 'uso', 'usar', 'preguntar', 'consult', 'sirve']],
        reply:
            'Escribí tu pregunta en Asistente (/asistente), o usá "¿Dudas con este paso?" dentro de un procedimiento. El asistente responde solo con los documentos vigentes de tus áreas y muestra al final de qué documento sacó cada dato. Si no encuentra información, te lo dice, te muestra los documentos más cercanos y te sugiere a quién consultar.',
    },
];

// Preguntas con "lo" en vez de la palabra "documento" ("¿cómo lo cargo?", "¿dónde lo veo?"). Van después de
// los temas con documento y usan el mismo texto que ellos.
const replyOf = (name: string): string => {
    const topic = TOPICS.find((t) => t.name === name);
    if (!topic) throw new Error(`No hay tema de ayuda "${name}"`);
    return topic.reply;
};
const PRONOUN_TOPICS: Topic[] = [
    { name: 'cargar-lo', all: [['carg', 'subo', 'subir', 'subi'], ['lo']], reply: replyOf('cargar-documento') },
    { name: 'ver-lo', all: [['ver', 'veo', 'busc', 'encuentr', 'abr'], ['lo']], reply: replyOf('ver-documento') },
];

// Respuesta a "ayuda" sola: el menú de temas, para que la persona sepa qué puede preguntar.
const MENU_REPLY =
    'Puedo ayudarte con: cómo ver y buscar documentos (/documentos), cómo cargar un documento (si sos administrador), qué significa cada estado, de dónde sale la información de una respuesta, cómo ejecutar un procedimiento (/ejecuciones), las métricas (/metricas) y los avisos de revisión. Preguntame con tus palabras, por ejemplo: "¿cómo lo cargo?" o "¿dónde veo las métricas?".';

// Un mensaje largo es casi seguro una consulta sobre el contenido de los documentos, no una pregunta de ayuda.
const MAX_TOKENS = 10;
const MAX_PRONOUN_TOKENS = 4;

// "ayuda" sola (o "ayudame"): el menú de temas. Es seguro antes de buscar: no tiene palabras de contenido.
export function platformMenuReply(question: string): string | null {
    const tokens = normalize(question).split(' ').filter(Boolean);
    return tokens.length > 0 && tokens.length <= 2 && has(tokens, ['ayud']) ? MENU_REPLY : null;
}

// Devuelve el texto de ayuda para la pregunta, o null si es una consulta que hay que buscar en los documentos.
// Se usa solo cuando la búsqueda no encuentra nada (prepareChat): lo que los documentos responden no es ayuda.
export function platformHelpReply(question: string): string | null {
    const menu = platformMenuReply(question);
    if (menu !== null) return menu;
    const tokens = normalize(question).split(' ').filter(Boolean);
    if (tokens.length === 0 || tokens.length > MAX_TOKENS) return null;
    if (!has(tokens, INTENT)) return null;

    // Sin una palabra de la app, ningún tema de texto fijo aplica (ver APP_TERMS).
    if (has(tokens, APP_TERMS)) {
        for (const topic of TOPICS) {
            if (topic.all.every((group) => has(tokens, group))) return topic.reply;
        }
    }
    // Con "lo", solo preguntas cortas: en una frase larga, "lo" puede ser contenido de un documento.
    if (tokens.length <= MAX_PRONOUN_TOKENS) {
        for (const topic of PRONOUN_TOPICS) {
            if (topic.all.every((group) => has(tokens, group))) return topic.reply;
        }
    }
    return null;
}