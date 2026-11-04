// Spec 009 (R8, HU36): el enlace a la búsqueda sin IA cuando el asistente no está disponible.
// Exportada para que POST /api/chat la use cuando Guille sume searchUrl (aviso 6 de la spec).

// Los límites de la búsqueda (spec 004, R4). La web los tiene en lib/documents/search-rules.ts.
const SEARCH_MIN = 3;
const SEARCH_MAX = 100;

// "/documentos?q=<pregunta>", con la pregunta en una línea, cortada en un espacio si pasa de
// SEARCH_MAX, o "/documentos" si queda con menos de SEARCH_MIN caracteres.
export function buildSearchUrl(question: string): string {
    let text = question.replace(/\s+/g, ' ').trim();
    if (text.length > SEARCH_MAX) {
        const cut = text.lastIndexOf(' ', SEARCH_MAX);
        text = (cut > 0 ? text.slice(0, cut) : text.slice(0, SEARCH_MAX)).trim();
    }
    return text.length < SEARCH_MIN ? '/documentos' : `/documentos?q=${encodeURIComponent(text)}`;
}
