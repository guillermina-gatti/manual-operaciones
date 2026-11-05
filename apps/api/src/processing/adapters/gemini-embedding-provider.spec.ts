import type { EmbeddingModel } from 'ai';

// `ai` es ESM y Jest en modo CJS no lo carga. Este reemplazo mínimo conserva el contrato que
// usa el adaptador: recibe el modelo, los textos y las opciones, y devuelve { embeddings }.
// El comportamiento real de embedMany se verificó aparte, con la librería real.
jest.mock('ai', () => ({
  embedMany: async ({ model, values, dimensions, providerOptions }: any) => {
    const { embeddings } = await model.doEmbed({ values, dimensions, providerOptions });
    return { embeddings };
  },
}));
import { EMBEDDING_DIMENSIONS } from '../ports/embedding-provider';
import { GeminiEmbeddingProvider } from './gemini-embedding-provider';

type DoEmbedCall = { values: string[]; dimensions?: number; providerOptions?: Record<string, Record<string, unknown>> };

// Modelo simulado mínimo: embedMany solo usa estos campos y doEmbed.
class FakeEmbeddingModel {
  readonly specificationVersion = 'v4';
  readonly provider = 'fake';
  readonly modelId = 'fake-embedding';
  readonly maxEmbeddingsPerCall = undefined;
  readonly supportsParallelCalls = true;
  readonly doEmbedCalls: DoEmbedCall[] = [];
  constructor(private readonly impl: (call: DoEmbedCall) => Promise<{ embeddings: number[][] }>) {}
  async doEmbed(call: DoEmbedCall) {
    this.doEmbedCalls.push(call);
    return this.impl(call);
  }
  asModel(): EmbeddingModel {
    return this as unknown as EmbeddingModel;
  }
}

function vector(seed: number): number[] {
  return Array.from({ length: EMBEDDING_DIMENSIONS }, (_, i) => (seed + i) / 1000);
}

describe('GeminiEmbeddingProvider', () => {
  it('devuelve un vector por texto, en el mismo orden', async () => {
    const model = new FakeEmbeddingModel(async ({ values }) => ({
      embeddings: values.map((_, i) => vector(i)),
    }));
    const provider = new GeminiEmbeddingProvider(model.asModel());

    const result = await provider.embedMany(['uno', 'dos']);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual(vector(0));
    expect(result[1]).toEqual(vector(1));
  });

  it('pide 768 dimensiones, también en las opciones de Google', async () => {
    const model = new FakeEmbeddingModel(async ({ values }) => ({ embeddings: values.map(() => vector(0)) }));
    const provider = new GeminiEmbeddingProvider(model.asModel());

    await provider.embedMany(['texto']);

    const call = model.doEmbedCalls[0];
    expect(call.dimensions).toBe(768);
    expect(call.providerOptions?.google).toMatchObject({ outputDimensionality: 768 });
  });

  it('no llama al modelo si no hay textos', async () => {
    const model = new FakeEmbeddingModel(async () => ({ embeddings: [] }));
    const provider = new GeminiEmbeddingProvider(model.asModel());

    const result = await provider.embedMany([]);

    expect(result).toEqual([]);
    expect(model.doEmbedCalls).toHaveLength(0);
  });

  it('propaga el error del modelo para que el worker pueda reintentar', async () => {
    const model = new FakeEmbeddingModel(async () => {
      throw new Error('cuota agotada');
    });
    const provider = new GeminiEmbeddingProvider(model.asModel());

    await expect(provider.embedMany(['texto'])).rejects.toThrow('cuota agotada');
  });
});