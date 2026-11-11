/* Puerto de embeddings. La implementación real usa embedMany del AI SDK con gemini-embedding-001
   y outputDimensionality 768 (la columna chunks.embedding es vector(768)). */
export const EMBEDDING_DIMENSIONS = 768;

export abstract class EmbeddingProvider {
    abstract embedMany(texts: string[]): Promise<number[][]>;

    // Opcionales: si un proveedor no los implementa, quien llama usa embedMany (ver processing.service.ts
    // y chat-pipeline.ts). Gemini los implementa con el tipo de tarea de cada uso.
    // Fragmentos de documentos, al procesarlos.
    embedDocuments?(texts: string[]): Promise<number[][]>;
    // Una pregunta, al consultarla (RETRIEVAL_QUERY frente a RETRIEVAL_DOCUMENT).
    embedQuery?(text: string): Promise<number[]>;
}