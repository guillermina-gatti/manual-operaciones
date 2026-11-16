/* Implementación real del puerto ProcessingRepository con Prisma (plan 5.3 y M2-B.2).
   Todas las transiciones de claim, lease y fencing usan exclusivamente el reloj de PostgreSQL (now()). */
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ChunkRow,
  ClaimResult,
  CommitOutcome,
  DocumentStatusValue,
  LockedState,
  PROCESSING_LEASE_TTL_SECONDS,
  ProcessingRepository,
  ReconciliationCandidate,
  VersionRecord,
  VersionStatusValue,
} from '../ports/processing-repository';

// Tiempo máximo de la transacción: con muchos fragmentos, las inserciones pueden tardar más que el
// valor por defecto de Prisma (5 s). El lock se mantiene solo durante ese tiempo.
export const COMMIT_TRANSACTION_TIMEOUT_MS = 30_000;
const DEFAULT_RECONCILIATION_LIMIT = 50;

// pgvector recibe el vector como texto: '[0.1,0.2,...]'.
export function toVectorLiteral(values: number[]): string {
  if (values.some((v) => !Number.isFinite(v))) throw new Error('Embedding con valores no finitos');
  return `[${values.join(',')}]`;
}

export class PrismaProcessingRepository extends ProcessingRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findVersion(versionId: string): Promise<VersionRecord | null> {
    const rows = await this.prisma.$queryRaw<VersionRecord[]>`
      SELECT id, document_id AS "documentId", storage_key AS "storageKey",
             mime_type AS "mimeType", processing_status::text AS "processingStatus"
        FROM document_versions
       WHERE id = ${versionId}::uuid`;
    return rows[0] ?? null;
  }

  async claimForProcessing(
    versionId: string,
    leaseTtlSeconds = PROCESSING_LEASE_TTL_SECONDS,
  ): Promise<ClaimResult> {
    const claimToken = randomUUID();
    const rows = await this.prisma.$queryRaw<VersionRecord[]>`
      UPDATE document_versions
         SET processing_status = 'PROCESSING'::"ProcessingStatus",
             processing_started_at = now(),
             lease_expires_at = now() + (${leaseTtlSeconds} * interval '1 second'),
             claim_token = ${claimToken}::uuid
       WHERE id = ${versionId}::uuid
         AND (
           processing_status = 'PENDING'::"ProcessingStatus"
           OR (
             processing_status = 'PROCESSING'::"ProcessingStatus"
             AND lease_expires_at IS NOT NULL
             AND lease_expires_at <= now()
           )
         )
      RETURNING id,
                document_id AS "documentId",
                storage_key AS "storageKey",
                mime_type AS "mimeType",
                processing_status::text AS "processingStatus"`;

    if (rows.length > 0) {
      return { acquired: true, claimToken, version: rows[0] };
    }

    const current = await this.findVersion(versionId);
    if (!current) return { acquired: false, reason: 'not_found' };
    if (current.processingStatus === 'READY') return { acquired: false, reason: 'already_ready' };
    if (current.processingStatus === 'FAILED') return { acquired: false, reason: 'failed' };
    return { acquired: false, reason: 'already_claimed' };
  }

  async renewLease(
    versionId: string,
    claimToken: string,
    leaseTtlSeconds = PROCESSING_LEASE_TTL_SECONDS,
  ): Promise<boolean> {
    const affected = await this.prisma.$executeRaw`
      UPDATE document_versions
         SET lease_expires_at = now() + (${leaseTtlSeconds} * interval '1 second')
       WHERE id = ${versionId}::uuid
         AND processing_status = 'PROCESSING'::"ProcessingStatus"
         AND claim_token = ${claimToken}::uuid
         AND lease_expires_at > now()`;
    return affected === 1;
  }

  async releaseClaim(versionId: string, claimToken: string): Promise<boolean> {
    const affected = await this.prisma.$executeRaw`
      UPDATE document_versions
         SET processing_status = 'PENDING'::"ProcessingStatus",
             claim_token = NULL,
             lease_expires_at = NULL,
             processing_started_at = NULL
       WHERE id = ${versionId}::uuid
         AND processing_status = 'PROCESSING'::"ProcessingStatus"
         AND claim_token = ${claimToken}::uuid`;
    return affected === 1;
  }

  async isClaimValid(versionId: string, claimToken: string): Promise<boolean> {
    const rows = await this.prisma.$queryRaw<{ valid: number }[]>`
      SELECT 1 AS valid
        FROM document_versions
       WHERE id = ${versionId}::uuid
         AND processing_status = 'PROCESSING'::"ProcessingStatus"
         AND claim_token = ${claimToken}::uuid
         AND lease_expires_at > now()`;
    return rows.length === 1;
  }

  async findPendingOrExpiredForReconciliation(
    pendingMinAgeSeconds: number,
    limit = DEFAULT_RECONCILIATION_LIMIT,
  ): Promise<ReconciliationCandidate[]> {
    return this.prisma.$queryRaw<ReconciliationCandidate[]>`
      SELECT id,
             processing_status::text AS "processingStatus"
        FROM document_versions
       WHERE (
         processing_status = 'PENDING'::"ProcessingStatus"
         AND created_at <= now() - (${pendingMinAgeSeconds} * interval '1 second')
       )
          OR (
         processing_status = 'PROCESSING'::"ProcessingStatus"
         AND lease_expires_at IS NOT NULL
         AND lease_expires_at <= now()
       )
       ORDER BY created_at ASC
       LIMIT ${limit}`;
  }

  async commitLocked(
    versionId: string,
    plan: (state: LockedState) => ChunkRow[],
    claimToken: string,
  ): Promise<CommitOutcome> {
    return this.prisma.$transaction(
      async (tx) => {
        // 1. documentId de la versión (sin lock todavía).
        const owner = await tx.$queryRaw<{ documentId: string }[]>`
          SELECT document_id AS "documentId" FROM document_versions WHERE id = ${versionId}::uuid`;
        if (owner.length === 0) return 'discarded';
        const { documentId } = owner[0];

        // 2. Lock compartido sobre la fila del documento (orden fijo: documents -> document_versions).
        await tx.$queryRaw`SELECT id FROM documents WHERE id = ${documentId}::uuid FOR SHARE`;

        // 3. Lock exclusivo sobre la versión y validación obligatoria de fencing antes de tocar chunks.
        const versionLock = await tx.$queryRaw<
          {
            status: string;
            processingStatus: string;
            claimToken: string | null;
            leaseValid: boolean;
          }[]
        >`
          SELECT status::text AS status,
                 processing_status::text AS "processingStatus",
                 claim_token::text AS "claimToken",
                 (lease_expires_at IS NOT NULL AND lease_expires_at > now()) AS "leaseValid"
            FROM document_versions
           WHERE id = ${versionId}::uuid
           FOR UPDATE`;
        if (versionLock.length === 0) return 'discarded';

        const lockedVersion = versionLock[0];
        if (
          lockedVersion.processingStatus !== 'PROCESSING' ||
          lockedVersion.claimToken !== claimToken ||
          !lockedVersion.leaseValid
        ) {
          return 'stale';
        }

        // 4. Relectura bajo el lock, cada una en su sentencia.
        const doc = await tx.$queryRaw<{ status: string }[]>`
          SELECT status::text AS status FROM documents WHERE id = ${documentId}::uuid`;
        const areas = await tx.$queryRaw<{ areaId: string }[]>`
          SELECT area_id AS "areaId" FROM document_areas WHERE document_id = ${documentId}::uuid`;
        if (doc.length === 0) return 'discarded';

        const state: LockedState = {
          documentStatus: doc[0].status as DocumentStatusValue,
          areaIds: areas.map((a) => a.areaId),
          version: { status: lockedVersion.status as VersionStatusValue },
        };

        // 5. Filas a insertar, con las áreas y la activación del momento del commit.
        const rows = plan(state);

        // 6. Reemplazar los fragmentos previos de esta versión.
        await tx.$executeRaw`DELETE FROM chunks WHERE document_version_id = ${versionId}::uuid`;
        for (const row of rows) {
          await tx.$executeRaw`
            INSERT INTO chunks (id, document_version_id, document_id, chunk_index, content,
                                page_number, section, token_count, area_ids, is_active, embedding)
            VALUES (${randomUUID()}::uuid, ${versionId}::uuid, ${documentId}::uuid,
                    ${row.chunkIndex}, ${row.content}, ${row.pageNumber}::int, ${row.section}::text,
                    ${row.tokenCount}, ${row.areaIds}::uuid[], ${row.isActive},
                    ${toVectorLiteral(row.embedding)}::vector)`;
        }

        // 7. Transición condicional a READY limpiando los campos del claim.
        const updated = await tx.$executeRaw`
          UPDATE document_versions
             SET processing_status = 'READY'::"ProcessingStatus",
                 processed_at = now(),
                 processing_error = NULL,
                 claim_token = NULL,
                 lease_expires_at = NULL
           WHERE id = ${versionId}::uuid
             AND processing_status = 'PROCESSING'::"ProcessingStatus"
             AND claim_token = ${claimToken}::uuid`;
        if (updated !== 1) {
          throw new Error('El claim dejó de ser válido al confirmar READY');
        }
        return 'ready';
      },
      { timeout: COMMIT_TRANSACTION_TIMEOUT_MS },
    );
  }

  async markFailed(
    versionId: string,
    message: string,
    claimToken: string,
  ): Promise<boolean> {
    const affected = await this.prisma.$executeRaw`
      UPDATE document_versions
         SET processing_status = 'FAILED'::"ProcessingStatus",
             processing_error = ${message},
             claim_token = NULL,
             lease_expires_at = NULL
       WHERE id = ${versionId}::uuid
         AND processing_status = 'PROCESSING'::"ProcessingStatus"
         AND claim_token = ${claimToken}::uuid`;
    return affected === 1;
  }
}
