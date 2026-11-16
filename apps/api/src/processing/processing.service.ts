/* Procesa una versión bajo claim persistente + heartbeat + fencing (M2-B.3):
   adquiere claim en PostgreSQL antes de S3/Gemini, renueva el lease periódicamente,
   propaga AbortSignal y confirma resultados de forma condicional con claimToken. */
import type { FileKind } from '../documents/file-inspector';
import { StoredFileNotFoundError } from '../storage/file-storage';
import { chunkPages } from './chunker';
import { LeaseHeartbeat } from './processing-heartbeat';
import { DocumentBytesReader } from './ports/document-bytes-reader';
import { EMBEDDING_DIMENSIONS, EmbeddingProvider } from './ports/embedding-provider';
import {
  ChunkRow,
  CommitOutcome,
  LockedState,
  PROCESSING_HEARTBEAT_INTERVAL_MS,
  PROCESSING_LEASE_TTL_SECONDS,
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

// El claim se perdió o el heartbeat falló durante la ejecución.
export class ClaimLostError extends Error {
  constructor(versionId: string) {
    super(`El claim de la versión ${versionId} dejó de ser válido`);
    this.name = 'ClaimLostError';
  }
}

export type ProcessOutcome = 'skipped' | 'failed' | CommitOutcome;

export interface ProcessOptions {
  isLastAttempt?: boolean;
}

export interface ProcessingServiceOptions {
  leaseTtlSeconds?: number;
  heartbeatIntervalMs?: number;
  onWarn?: (message: string) => void;
}

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
    private readonly options: ProcessingServiceOptions = {},
  ) {}

  async process(
    versionId: string,
    processOptions: ProcessOptions = {},
  ): Promise<ProcessOutcome> {
    const leaseTtlSeconds =
      this.options.leaseTtlSeconds ?? PROCESSING_LEASE_TTL_SECONDS;
    const heartbeatIntervalMs =
      this.options.heartbeatIntervalMs ?? PROCESSING_HEARTBEAT_INTERVAL_MS;

    const claim = await this.repository.claimForProcessing(
      versionId,
      leaseTtlSeconds,
    );

    if (!claim.acquired) {
      if (claim.reason === 'not_found') {
        throw new VersionNotFoundError(versionId);
      }
      // already_ready, failed o already_claimed: no competir ni alterar estado ajeno.
      return 'skipped';
    }

    const { claimToken, version } = claim;
    const heartbeat = new LeaseHeartbeat(
      this.repository,
      versionId,
      claimToken,
      {
        intervalMs: heartbeatIntervalMs,
        leaseTtlSeconds,
        onWarn: this.options.onWarn,
      },
    );

    const assertClaimActive = () => {
      if (heartbeat.signal.aborted) {
        throw new ClaimLostError(versionId);
      }
    };

    heartbeat.start();
    try {
      const kind = KIND_BY_MIME[version.mimeType];
      if (!kind) throw new Error(`Tipo de archivo no soportado: ${version.mimeType}`);

      assertClaimActive();
      // 1. Leer (sin AbortSignal en DocumentBytesReader/S3; protegido por fencing final).
      const bytes = await this.reader.read(version.storageKey);

      assertClaimActive();
      const pages = await extractText(bytes, kind);
      const chunks = chunkPages(pages, { kind });
      if (chunks.length === 0) throw new EmptyDocumentError(versionId);

      assertClaimActive();
      // 2. Embeddings con propagación real de AbortSignal hacia AI SDK.
      const texts = chunks.map((c) => c.content);
      const vectors = await (this.embeddings.embedDocuments?.(texts, {
        abortSignal: heartbeat.signal,
      }) ?? this.embeddings.embedMany(texts, { abortSignal: heartbeat.signal }));

      assertClaimActive();
      if (vectors.length !== chunks.length) {
        throw new Error(`Se pidieron ${chunks.length} embeddings y llegaron ${vectors.length}`);
      }
      for (const vector of vectors) {
        if (vector.length !== EMBEDDING_DIMENSIONS) {
          throw new Error(`Embedding de ${vector.length} dimensiones; se espera ${EMBEDDING_DIMENSIONS}`);
        }
      }

      assertClaimActive();
      // 3. Transacción corta con FOR UPDATE + fencing obligatorio por claimToken.
      return await this.repository.commitLocked(
        versionId,
        (state) => buildChunkRows(state, chunks, vectors),
        claimToken,
      );
    } catch (error) {
      await heartbeat.stop();

      if (error instanceof ClaimLostError || heartbeat.signal.aborted) {
        return 'stale';
      }

      const message = error instanceof Error ? error.message : String(error);
      const permanent =
        error instanceof EmptyDocumentError ||
        error instanceof StoredFileNotFoundError;

      if (permanent) {
        await this.repository.markFailed(versionId, message, claimToken);
        throw error;
      }

      if (processOptions.isLastAttempt) {
        await this.repository.markFailed(versionId, message, claimToken);
        throw error;
      }

      await this.repository.releaseClaim(versionId, claimToken);
      throw error;
    } finally {
      await heartbeat.stop();
    }
  }
}
