/* Calcula los embeddings de los fragmentos con gemini-embedding-001 a través del AI SDK.
   Fija 768 dimensiones (plan 5.2): la columna chunks.embedding es vector(768). El modelo se
   recibe por constructor: en producción es google.embeddingModel(...) y en tests un modelo simulado. */
import { embedMany, type EmbeddingModel } from 'ai';
import { EMBEDDING_DIMENSIONS, EmbeddingProvider } from '../ports/embedding-provider';

export const EMBEDDING_MODEL_ID = 'gemini-embedding-001';

export class GeminiEmbeddingProvider extends EmbeddingProvider {
  constructor(private readonly model: EmbeddingModel) {
    super();
  }

  async embedMany(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const { embeddings } = await embedMany({
      model: this.model,
      values: texts,
      dimensions: EMBEDDING_DIMENSIONS,
      // Explícito para el proveedor de Google, además de dimensions.
      providerOptions: { google: { outputDimensionality: EMBEDDING_DIMENSIONS } },
    });
    return embeddings;
  }
}