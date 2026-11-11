// Rutas de la plataforma que las respuestas de ayuda mencionan (chat-help.ts de la API). En el texto del
// asistente se muestran como enlace azul. Más largas primero, para que "/documentos/nuevo" no se corte en "/documentos".
const ROUTE_PATHS = [
    '/documentos/por-revisar',
    '/documentos/alertas',
    '/documentos/nuevo',
    '/documentos',
    '/ejecuciones',
    '/metricas',
    '/asistente',
];

const ROUTE_RE = new RegExp(`(${ROUTE_PATHS.join('|')})(?![\\w/-])`, 'g');

export interface TextPart {
    text: string;
    route?: string;
}

// Parte el texto en trozos: los que son una ruta llevan la ruta para armar el enlace.
export function splitRoutes(text: string): TextPart[] {
    const parts: TextPart[] = [];
    let last = 0;
    for (const match of text.matchAll(ROUTE_RE)) {
        const start = match.index ?? 0;
        if (start > last) parts.push({ text: text.slice(last, start) });
        parts.push({ text: match[0], route: match[0] });
        last = start + match[0].length;
    }
    if (last < text.length) parts.push({ text: text.slice(last) });
    return parts;
}