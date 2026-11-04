/* Puerto de persistencia del worker. La implementación real (Prisma) hace la transacción;
   el servicio solo describe qué hacer con el estado que lee bajo el lock. */

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

export type CommitOutcome = 'ready' | 'discarded';

export abstract class ProcessingRepository {
  abstract findVersion(versionId: string): Promise<VersionRecord | null>;

  // Transacción: toma FOR SHARE sobre documents, relee el estado con sentencias separadas.
  // Si la versión ya no existe, devuelve 'discarded' sin llamar a plan(). Si existe, llama a
  // plan() con ese estado, borra los fragmentos previos de la versión, inserta las filas que
  // devuelve y marca la versión READY; devuelve 'ready'.
  abstract commitLocked(
    versionId: string,
    plan: (state: LockedState) => ChunkRow[],
  ): Promise<CommitOutcome>;
}