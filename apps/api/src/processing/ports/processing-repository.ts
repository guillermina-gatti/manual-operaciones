/* Puerto de persistencia del worker. La implementación real (Prisma) hace la transacción;
   el servicio solo describe qué hacer con el estado que lee bajo el lock. */

export const PROCESSING_LEASE_TTL_SECONDS = 180;
export const PROCESSING_HEARTBEAT_INTERVAL_MS = 60_000;

export type DocumentStatusValue = 'ACTIVE' | 'ARCHIVED';
export type VersionStatusValue = 'CURRENT' | 'REPLACED';

// Lo que se lee al empezar, fuera de cualquier lock. Solo sirve para decidir si seguir.
export interface VersionRecord {
  id: string;
  documentId: string;
  storageKey: string;
  mimeType: string;
  processingStatus: 'PENDING' | 'PROCESSING' | 'READY' | 'FAILED';
}

export type ClaimFailureReason =
  | 'already_ready'
  | 'already_claimed'
  | 'failed'
  | 'not_found';

export type ClaimResult =
  | { acquired: true; claimToken: string; version: VersionRecord }
  | { acquired: false; reason: ClaimFailureReason };

export interface ReconciliationCandidate {
  id: string;
  processingStatus: 'PENDING' | 'PROCESSING';
}

// Lo que se relee DENTRO de la transacción, con FOR SHARE tomado sobre documents.
// version es null si la versión ya no existe.
export interface LockedState {
  documentStatus: DocumentStatusValue;
  areaIds: string[];
  version: { status: VersionStatusValue } | null;
}

// Una fila de chunks lista para insertar.
export interface ChunkRow {
  chunkIndex: number;
  content: string;
  pageNumber: number | null;
  tokenCount: number;
  section: string | null;
  areaIds: string[];
  isActive: boolean;
  embedding: number[];
}

export type CommitOutcome = 'ready' | 'discarded' | 'stale';

export abstract class ProcessingRepository {
  abstract findVersion(versionId: string): Promise<VersionRecord | null>;

  // Adquiere de forma atómica el claim sobre una versión PENDING o PROCESSING con lease vencido.
  abstract claimForProcessing(
    versionId: string,
    leaseTtlSeconds?: number,
  ): Promise<ClaimResult>;

  // Renueva el lease usando el reloj de PostgreSQL si el claimToken y el estado siguen vigentes.
  abstract renewLease(
    versionId: string,
    claimToken: string,
    leaseTtlSeconds?: number,
  ): Promise<boolean>;

  // Libera el claim (PROCESSING -> PENDING) únicamente si el claimToken coincide.
  abstract releaseClaim(
    versionId: string,
    claimToken: string,
  ): Promise<boolean>;

  // Comprueba en PostgreSQL si el claim sigue vigente (PROCESSING, token coincidente, lease > now()).
  abstract isClaimValid(
    versionId: string,
    claimToken: string,
  ): Promise<boolean>;

  // Lista versiones PENDING antiguas o PROCESSING con lease vencido para reconciliación.
  abstract findPendingOrExpiredForReconciliation(
    pendingMinAgeSeconds: number,
    limit?: number,
  ): Promise<ReconciliationCandidate[]>;

  // Transacción: toma FOR SHARE sobre documents y FOR UPDATE sobre document_versions.
  // Si se provee claimToken, valida fencing (PROCESSING, token coincidente y lease vigente) antes
  // de borrar/insertar fragmentos. Devuelve 'stale' si el claim ya no es válido.
  abstract commitLocked(
    versionId: string,
    plan: (state: LockedState) => ChunkRow[],
    claimToken?: string,
  ): Promise<CommitOutcome>;

  // Marca la versión FAILED con el motivo visible para el ADMIN (processingError).
  // Si se provee claimToken, exige estado PROCESSING y token coincidente.
  abstract markFailed(
    versionId: string,
    message: string,
    claimToken?: string,
  ): Promise<boolean>;
}
