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
    abstract search(queryVector: number[], areaIds: string[], limit: number): Promise<RetrievedChunk[]>;
}