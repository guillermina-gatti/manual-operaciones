/* Implementaciones falsas de los puertos del worker, para testear el servicio sin base ni red. */
import { randomUUID } from 'node:crypto';
import { DocumentBytesReader } from '../ports/document-bytes-reader';
import { EMBEDDING_DIMENSIONS, EmbeddingProvider } from '../ports/embedding-provider';
import {
  ChunkRow,
  ClaimResult,
  CommitOutcome,
  LockedState,
  PROCESSING_LEASE_TTL_SECONDS,
  ProcessingRepository,
  ReconciliationCandidate,
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

type StoredVersion = VersionRecord & {
  status: 'CURRENT' | 'REPLACED';
  processingStartedAt?: Date | null;
  leaseExpiresAt?: Date | null;
  claimToken?: string | null;
  createdAt?: Date;
};

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

  async claimForProcessing(
    versionId: string,
    leaseTtlSeconds = PROCESSING_LEASE_TTL_SECONDS,
  ): Promise<ClaimResult> {
    const version = this.versions.get(versionId);
    if (!version) return { acquired: false, reason: 'not_found' };
    if (version.processingStatus === 'READY') return { acquired: false, reason: 'already_ready' };
    if (version.processingStatus === 'FAILED') return { acquired: false, reason: 'failed' };

    const now = new Date();
    const expired =
      version.processingStatus === 'PROCESSING' &&
      version.leaseExpiresAt != null &&
      version.leaseExpiresAt.getTime() <= now.getTime();

    if (version.processingStatus === 'PENDING' || expired) {
      const claimToken = randomUUID();
      version.processingStatus = 'PROCESSING';
      version.processingStartedAt = now;
      version.leaseExpiresAt = new Date(now.getTime() + leaseTtlSeconds * 1000);
      version.claimToken = claimToken;
      return { acquired: true, claimToken, version: { ...version } };
    }

    return { acquired: false, reason: 'already_claimed' };
  }

  async renewLease(
    versionId: string,
    claimToken: string,
    leaseTtlSeconds = PROCESSING_LEASE_TTL_SECONDS,
  ): Promise<boolean> {
    const version = this.versions.get(versionId);
    if (
      !version ||
      version.processingStatus !== 'PROCESSING' ||
      version.claimToken !== claimToken ||
      !version.leaseExpiresAt ||
      version.leaseExpiresAt.getTime() <= Date.now()
    ) {
      return false;
    }
    version.leaseExpiresAt = new Date(Date.now() + leaseTtlSeconds * 1000);
    return true;
  }

  async releaseClaim(versionId: string, claimToken: string): Promise<boolean> {
    const version = this.versions.get(versionId);
    if (
      !version ||
      version.processingStatus !== 'PROCESSING' ||
      version.claimToken !== claimToken
    ) {
      return false;
    }
    version.processingStatus = 'PENDING';
    version.claimToken = null;
    version.leaseExpiresAt = null;
    version.processingStartedAt = null;
    return true;
  }

  async isClaimValid(versionId: string, claimToken: string): Promise<boolean> {
    const version = this.versions.get(versionId);
    return Boolean(
      version &&
        version.processingStatus === 'PROCESSING' &&
        version.claimToken === claimToken &&
        version.leaseExpiresAt &&
        version.leaseExpiresAt.getTime() > Date.now(),
    );
  }

  async findPendingOrExpiredForReconciliation(
    pendingMinAgeSeconds: number,
    limit = 50,
  ): Promise<ReconciliationCandidate[]> {
    const now = Date.now();
    const minCreatedAt = now - pendingMinAgeSeconds * 1000;
    const out: ReconciliationCandidate[] = [];
    for (const v of this.versions.values()) {
      if (v.processingStatus === 'PENDING') {
        const created = v.createdAt?.getTime() ?? 0;
        if (created <= minCreatedAt) {
          out.push({ id: v.id, processingStatus: 'PENDING' });
        }
      } else if (
        v.processingStatus === 'PROCESSING' &&
        v.leaseExpiresAt &&
        v.leaseExpiresAt.getTime() <= now
      ) {
        out.push({ id: v.id, processingStatus: 'PROCESSING' });
      }
      if (out.length >= limit) break;
    }
    return out;
  }

  async markFailed(
    versionId: string,
    message: string,
    claimToken?: string,
  ): Promise<boolean> {
    const version = this.versions.get(versionId);
    if (!version) return false;
    if (
      claimToken !== undefined &&
      (version.processingStatus !== 'PROCESSING' || version.claimToken !== claimToken)
    ) {
      return false;
    }
    version.processingStatus = 'FAILED';
    version.claimToken = null;
    version.leaseExpiresAt = null;
    this.failures.set(versionId, message);
    return true;
  }

  async commitLocked(
    versionId: string,
    plan: (state: LockedState) => ChunkRow[],
    claimToken?: string,
  ): Promise<CommitOutcome> {
    this.lockHeld = true;
    try {
      this.beforeCommit?.(this);
      const version = this.versions.get(versionId);
      if (!version) return 'discarded'; // sin llamar a plan

      if (claimToken !== undefined) {
        if (
          version.processingStatus !== 'PROCESSING' ||
          version.claimToken !== claimToken ||
          !version.leaseExpiresAt ||
          version.leaseExpiresAt.getTime() <= Date.now()
        ) {
          return 'stale';
        }
      }

      const state: LockedState = {
        documentStatus: this.documentStatus,
        areaIds: [...this.areaIds],
        version: { status: version.status },
      };
      const rows = plan(state);
      this.chunksByVersion.set(versionId, rows); // reemplaza los fragmentos previos de la versión
      version.processingStatus = 'READY';
      version.claimToken = null;
      version.leaseExpiresAt = null;
      return 'ready';
    } finally {
      this.lockHeld = false;
    }
  }
}
