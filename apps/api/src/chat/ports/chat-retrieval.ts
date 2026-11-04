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
}

export abstract class ChatRetrieval {
    abstract search(queryVector: number[], areaIds: string[], limit: number): Promise<RetrievedChunk[]>;
}