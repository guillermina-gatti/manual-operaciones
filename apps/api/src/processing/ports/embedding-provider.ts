/* Puerto de embeddings. La implementación real usa embedMany del AI SDK con gemini-embedding-001
   y outputDimensionality 768 (la columna chunks.embedding es vector(768)). */
export const EMBEDDING_DIMENSIONS = 768;

export abstract class EmbeddingProvider {
    abstract embedMany(texts: string[]): Promise<number[][]>;
}