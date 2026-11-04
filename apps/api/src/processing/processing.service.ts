/* Procesa una versión: lee el archivo, extrae, fragmenta y calcula embeddings FUERA de cualquier
   lock; después abre la transacción solo para releer el estado, insertar y marcar READY (HU14,
   sección 5.3 del informe y acuerdos con Matías). */
import type { FileKind } from '../documents/file-inspector';
import { chunkPages } from './chunker';
import { DocumentBytesReader } from './ports/document-bytes-reader';
import { EMBEDDING_DIMENSIONS, EmbeddingProvider } from './ports/embedding-provider';
import {
  ChunkRow,
  CommitOutcome,
  LockedState,
  ProcessingRepository,
} from './ports/processing-repository';
import { extractText } from './text-extraction';

// La versión todavía no existe (el trabajo llegó antes del commit): el procesador reintenta.
export class VersionNotFoundError extends Error {
  constructor(versionId: string) {
    super(`La versión ${versionId} todavía no existe`);
    this.name = 'VersionNotFoundError';
  }
}

// El archivo no tiene texto extraíble: no se marca READY con cero fragmentos.
export class EmptyDocumentError extends Error {
  constructor(versionId: string) {
    super(`La versión ${versionId} no tiene texto extraíble`);
    this.name = 'EmptyDocumentError';
  }
}

export type ProcessOutcome = 'skipped' | CommitOutcome;

const KIND_BY_MIME: Record<string, FileKind> = {
  'application/pdf': 'pdf',
  'text/plain': 'txt',
  'text/markdown': 'md',
};

// Regla de activación (plan 003, R8): un fragmento sirve solo si el documento está ACTIVE
// y la versión sigue CURRENT. Se evalúa con el estado leído bajo el lock.
export function isActiveFor(state: LockedState): boolean {
  return state.documentStatus === 'ACTIVE' && state.version?.status === 'CURRENT';
}

// Arma las filas con las áreas y la activación del momento del commit, no las de al empezar.
export function buildChunkRows(
  state: LockedState,
  chunks: ReturnType<typeof chunkPages>,
  embeddings: number[][],
): ChunkRow[] {
  const isActive = isActiveFor(state);
  return chunks.map((chunk, i) => ({
    chunkIndex: chunk.chunkIndex,
    content: chunk.content,
    pageNumber: chunk.pageNumber,
    tokenCount: chunk.tokenCount,
    section: chunk.section,
    areaIds: [...state.areaIds],
    isActive,
    embedding: embeddings[i],
  }));
}

export class ProcessingService {
  constructor(
    private readonly repository: ProcessingRepository,
    private readonly reader: DocumentBytesReader,
    private readonly embeddings: EmbeddingProvider,
  ) {}

  async process(versionId: string): Promise<ProcessOutcome> {
    const version = await this.repository.findVersion(versionId);
    if (!version) throw new VersionNotFoundError(versionId);
    if (version.processingStatus === 'READY') return 'skipped'; // reintento de un trabajo ya hecho

    const kind = KIND_BY_MIME[version.mimeType];
    if (!kind) throw new Error(`Tipo de archivo no soportado: ${version.mimeType}`);

    // 1. Leer y extraer: sin lock.
    const bytes = await this.reader.read(version.storageKey);
    const pages = await extractText(bytes, kind);
    const chunks = chunkPages(pages, { kind });
    if (chunks.length === 0) throw new EmptyDocumentError(versionId);

    // 2. Embeddings: sin lock, antes de abrir la transacción.
    const vectors = await this.embeddings.embedMany(chunks.map((c) => c.content));
    if (vectors.length !== chunks.length) {
      throw new Error(`Se pidieron ${chunks.length} embeddings y llegaron ${vectors.length}`);
    }
    for (const vector of vectors) {
      if (vector.length !== EMBEDDING_DIMENSIONS) {
        throw new Error(`Embedding de ${vector.length} dimensiones; se espera ${EMBEDDING_DIMENSIONS}`);
      }
    }

    // 3. Transacción corta: releer bajo el lock, insertar y marcar READY.
    return this.repository.commitLocked(versionId, (state) =>
      buildChunkRows(state, chunks, vectors),
    );
  }
}