/* Implementaciones falsas de los puertos del worker, para testear el servicio sin base ni red. */
import { DocumentBytesReader } from '../ports/document-bytes-reader';
import { EMBEDDING_DIMENSIONS, EmbeddingProvider } from '../ports/embedding-provider';
import {
  ChunkRow,
  CommitOutcome,
  LockedState,
  ProcessingRepository,
  VersionRecord,
} from '../ports/processing-repository';

export class FakeBytesReader extends DocumentBytesReader {
  constructor(private readonly files: Map<string, Buffer>) {
    super();
  }
  async read(storageKey: string): Promise<Buffer> {
    const file = this.files.get(storageKey);
    if (!file) throw new Error(`No existe ${storageKey}`);
    return file;
  }
}

export class FakeEmbeddings extends EmbeddingProvider {
  constructor(
    private readonly dimensions = EMBEDDING_DIMENSIONS,
    private readonly onCall?: () => void,
  ) {
    super();
  }
  async embedMany(texts: string[]): Promise<number[][]> {
    this.onCall?.();
    return texts.map((_, i) => Array.from({ length: this.dimensions }, () => i / 1000));
  }
}

type StoredVersion = VersionRecord & { status: 'CURRENT' | 'REPLACED' };

// Simula la base: el estado vive en memoria y commitLocked replica las reglas de la transacción.
export class FakeProcessingRepository extends ProcessingRepository {
  versions = new Map<string, StoredVersion>();
  documentStatus: 'ACTIVE' | 'ARCHIVED' = 'ACTIVE';
  areaIds: string[] = [];
  // Fragmentos guardados por versión, como en la tabla chunks.
  chunksByVersion = new Map<string, ChunkRow[]>();
  // Cambios concurrentes que ocurren en momentos concretos del procesamiento.
  afterFind?: (repo: FakeProcessingRepository) => void;
  beforeCommit?: (repo: FakeProcessingRepository) => void;

  // Motivos de fallo registrados por markFailed, por versión.
  failures = new Map<string, string>();

  private lockHeld = false;
  isLockHeld(): boolean {
    return this.lockHeld;
  }

  async findVersion(versionId: string): Promise<VersionRecord | null> {
    const found = this.versions.get(versionId);
    const snapshot = found ? { ...found } : null;
    this.afterFind?.(this);
    return snapshot;
  }

  async markFailed(versionId: string, message: string): Promise<void> {
    const version = this.versions.get(versionId);
    if (!version) return;
    version.processingStatus = 'FAILED';
    this.failures.set(versionId, message);
  }

  async commitLocked(
    versionId: string,
    plan: (state: LockedState) => ChunkRow[],
  ): Promise<CommitOutcome> {
    this.lockHeld = true;
    try {
      this.beforeCommit?.(this);
      const version = this.versions.get(versionId);
      if (!version) return 'discarded'; // sin llamar a plan

      const state: LockedState = {
        documentStatus: this.documentStatus,
        areaIds: [...this.areaIds],
        version: { status: version.status },
      };
      const rows = plan(state);
      this.chunksByVersion.set(versionId, rows); // reemplaza los fragmentos previos de la versión
      version.processingStatus = 'READY';
      return 'ready';
    } finally {
      this.lockHeld = false;
    }
  }
}