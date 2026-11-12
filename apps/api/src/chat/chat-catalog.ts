// Listado de documentos por área: "¿qué documentos hay en cada área?" o "documentos de ventas". Respuesta
// fija, sin buscar en el contenido ni llamar al modelo. Va antes de la búsqueda.

export interface CatalogGroup {
    areaName: string;
    titles: string[];
}

export const NO_CATALOG_TEXT = 'No hay documentos vigentes para mostrar en tus áreas.';

// Sin tildes ni signos, en minúsculas. Igual que en chat-help.ts.
function normalize(text: string): string {
    return text
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

const tokensOf = (text: string): string[] => normalize(text).split(' ').filter(Boolean);

// Una palabra coincide si es igual, o si empieza igual desde 4 letras ("documento" con "documentos").
const hasWord = (tokens: string[], words: string[]) =>
    tokens.some((t) => words.some((w) => t === w || (w.length >= 4 && t.startsWith(w))));

const AREA_WORDS = ['area'];
const DOCUMENT_WORDS = ['documento', 'manual', 'archivo'];
// Pedidos de listado: "cada área", "todas", "cuáles", "lista", "mostrame"...
const LIST_WORDS = ['cada', 'todas', 'todos', 'cuales', 'lista', 'listar', 'listame', 'listado', 'mostr', 'muestr', 'dame'];
// Un mensaje largo es casi seguro una consulta sobre el contenido, no un listado.
const MAX_TOKENS = 14;
// "documentos de ventas": corto, con la palabra de documento y nada más de contenido.
const MAX_AREA_TOKENS = 6;

// "¿qué documentos hay en cada área?": nombra áreas y documentos y pide verlos.
export function isCatalogQuestion(question: string): boolean {
    const tokens = tokensOf(question);
    if (tokens.length === 0 || tokens.length > MAX_TOKENS) return false;
    return hasWord(tokens, AREA_WORDS) && hasWord(tokens, DOCUMENT_WORDS) && hasWord(tokens, LIST_WORDS);
}

// "documentos de ventas": una pregunta corta sobre los documentos. Solo es un listado si nombra un área.
export function isDocumentsOfAreaQuestion(question: string): boolean {
    const tokens = tokensOf(question);
    return tokens.length >= 2 && tokens.length <= MAX_AREA_TOKENS && hasWord(tokens, DOCUMENT_WORDS);
}

// Pregunta corta (una palabra o dos): puede ser solo el nombre de un área ("ventas"). Se mira si nombra un área.
export function isShortQuestion(question: string): boolean {
    const count = tokensOf(question).length;
    return count > 0 && count <= 3;
}

// "area" sola, "áreas", "¿qué áreas tengo?": pregunta por las áreas, no por sus documentos.
const AREA_STOP_WORDS = ['de', 'las', 'los', 'mis', 'que', 'hay', 'cuales', 'son', 'tengo', 'tiene', 'en', 'la', 'el', 'a'];
export function isAreasQuestion(question: string): boolean {
    const tokens = tokensOf(question);
    if (tokens.length === 0 || tokens.length > 4) return false;
    const hasArea = hasWord(tokens, AREA_WORDS);
    const onlyAreaWords = tokens.every((t) => hasWord([t], AREA_WORDS) || AREA_STOP_WORDS.includes(t));
    return hasArea && onlyAreaWords;
}

// Las áreas con documentos, en una frase. Pide preguntar por los documentos de cada una.
export function formatAreas(groups: CatalogGroup[]): string {
    const names = groups.filter((group) => group.titles.length > 0).map((group) => group.areaName);
    if (names.length === 0) return NO_CATALOG_TEXT;
    const list =
        names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`;
    const count = names.length === 1 ? 'un área' : `${names.length} áreas`;
    return `Tenés acceso a ${count}: ${list}. Preguntame por los documentos de cada una, por ejemplo "documentos de ${names[0]}".`;
}

// El nombre del área que aparece en la pregunta (palabras enteras, sin tildes). Si hay varias, la más larga.
export function areaNamed(question: string, areaNames: string[]): string | null {
    const padded = ` ${normalize(question)} `;
    let best: string | null = null;
    for (const name of areaNames) {
        const normalized = normalize(name);
        if (normalized && padded.includes(` ${normalized} `)) {
            if (best === null || normalized.length > normalize(best).length) best = name;
        }
    }
    return best;
}

// Un bloque por área con documentos: el nombre, la cantidad y los títulos. Las áreas sin documentos no se muestran.
export function formatCatalog(groups: CatalogGroup[]): string {
    const withDocuments = groups.filter((group) => group.titles.length > 0);
    if (withDocuments.length === 0) return NO_CATALOG_TEXT;
    return withDocuments
        .map((group) => `${group.areaName} (${group.titles.length}):\n${group.titles.map((title) => `- ${title}`).join('\n')}`)
        .join('\n\n');
}