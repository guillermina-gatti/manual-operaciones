/* Calcula los embeddings con gemini-embedding-001 a través del AI SDK. Fija 768 dimensiones (plan 5.2):
   la columna chunks.embedding es vector(768). El modelo se recibe por constructor: en producción es
   google.embeddingModel(...) y en tests un modelo simulado.
   Los fragmentos y las preguntas se embeben con tipos de tarea distintos (RETRIEVAL_DOCUMENT y
   RETRIEVAL_QUERY), que es como Gemini está pensado para buscar. */
import { embedMany, type EmbeddingModel } from 'ai';
import { EMBEDDING_DIMENSIONS, EmbeddingProvider } from '../ports/embedding-provider';

export const EMBEDDING_MODEL_ID = 'gemini-embedding-001';

export type EmbeddingTaskType = 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY';

export class GeminiEmbeddingProvider extends EmbeddingProvider {
  constructor(private readonly model: EmbeddingModel) {
    super();
  }

  // Sin tipo de tarea: se mantiene por compatibilidad con quien lo llame directamente.
  async embedMany(texts: string[]): Promise<number[][]> {
    return this.embed(texts);
  }

  embedDocuments(texts: string[]): Promise<number[][]> {
    return this.embed(texts, 'RETRIEVAL_DOCUMENT');
  }

  async embedQuery(text: string): Promise<number[]> {
    const [vector] = await this.embed([text], 'RETRIEVAL_QUERY');
    return vector;
  }

  private async embed(texts: string[], taskType?: EmbeddingTaskType): Promise<number[][]> {
    if (texts.length === 0) return [];
    const { embeddings } = await embedMany({
      model: this.model,
      values: texts,
      dimensions: EMBEDDING_DIMENSIONS,
      // Explícito para el proveedor de Google, además de dimensions.
      providerOptions: {
        google: {
          outputDimensionality: EMBEDDING_DIMENSIONS,
          ...(taskType ? { taskType } : {}),
        },
      },
    });
    return embeddings;
  }
}