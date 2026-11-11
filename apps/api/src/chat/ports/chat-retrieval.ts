// Puerto de recuperación: busca fragmentos vigentes de las áreas del usuario por similitud.
export interface RetrievedChunk {
    chunkId: string;
    documentId: string;
    documentTitle: string;
    versionId: string;
    versionNumber: number;
    section: string | null;
    content: string;
    validFrom: string; // YYYY-MM-DD
    distance: number; // distancia coseno: menor = más parecido
    // HU18: para el enlace firmado al archivo de la versión. Los trae la búsqueda; los tests pueden
    // omitirlos (sin ellos, la fuente queda sin enlace).
    storageKey?: string;
    fileName?: string; // nombre original del archivo, para la descarga
    url?: string; // enlace firmado, que pone withSignedLinks (chat-links.ts) antes de responder
}

export abstract class ChatRetrieval {
    // areaIds null = sin filtro por área (solo ADMIN). Un array vacío no devuelve nada.
    // focusArea (opcional): nombre de un área; si se pasa, solo documentos de esa área (y de areaIds).
    abstract search(
        queryVector: number[],
        areaIds: string[] | null,
        limit: number,
        focusArea?: string,
    ): Promise<RetrievedChunk[]>;
}