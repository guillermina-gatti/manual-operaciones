/* Implementación real del puerto ProcessingRepository con Prisma (plan 5.3 y acuerdos con Matías).
   commitLocked abre una transacción corta: toma FOR SHARE sobre documents y después relee estado,
   áreas y versión, cada una en su propia sentencia. Los embeddings ya llegaron calculados (el
   servicio los calcula antes), así que el lock no se mantiene durante llamadas a la IA. */
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ChunkRow,
  CommitOutcome,
  DocumentStatusValue,
  LockedState,
  ProcessingRepository,
  VersionRecord,
  VersionStatusValue,
} from '../ports/processing-repository';

// Tiempo máximo de la transacción: con muchos fragmentos, las inserciones pueden tardar más que el
// valor por defecto de Prisma (5 s). El lock se mantiene solo durante ese tiempo.
export const COMMIT_TRANSACTION_TIMEOUT_MS = 30_000;

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

  async commitLocked(
    versionId: string,
    plan: (state: LockedState) => ChunkRow[],
  ): Promise<CommitOutcome> {
    return this.prisma.$transaction(
      async (tx) => {
        // 1. documentId de la versión (sin lock todavía).
        const owner = await tx.$queryRaw<{ documentId: string }[]>`
          SELECT document_id AS "documentId" FROM document_versions WHERE id = ${versionId}::uuid`;
        if (owner.length === 0) return 'discarded';
        const { documentId } = owner[0];

        // 2. Lock compartido sobre la fila del documento: espera a las operaciones de Matías.
        await tx.$queryRaw`SELECT id FROM documents WHERE id = ${documentId}::uuid FOR SHARE`;

        // 3. Relectura bajo el lock, cada una en su sentencia.
        const doc = await tx.$queryRaw<{ status: string }[]>`
          SELECT status::text AS status FROM documents WHERE id = ${documentId}::uuid`;
        const areas = await tx.$queryRaw<{ areaId: string }[]>`
          SELECT area_id AS "areaId" FROM document_areas WHERE document_id = ${documentId}::uuid`;
        const version = await tx.$queryRaw<{ status: string }[]>`
          SELECT status::text AS status FROM document_versions WHERE id = ${versionId}::uuid`;
        if (doc.length === 0) return 'discarded';

        const state: LockedState = {
          documentStatus: doc[0].status as DocumentStatusValue,
          areaIds: areas.map((a) => a.areaId),
          version: version[0] ? { status: version[0].status as VersionStatusValue } : null,
        };
        if (!state.version) return 'discarded'; // la versión ya no existe

        // 4. Filas a insertar, con las áreas y la activación del momento del commit.
        const rows = plan(state);

        // 5. Reemplazar los fragmentos previos de esta versión (reintentos del worker).
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

        // 6. La versión queda READY (el archivo se procesó bien, aunque no esté CURRENT).
        await tx.$executeRaw`
          UPDATE document_versions
             SET processing_status = 'READY'::"ProcessingStatus",
                 processed_at = now(),
                 processing_error = NULL
           WHERE id = ${versionId}::uuid`;
        return 'ready';
      },
      { timeout: COMMIT_TRANSACTION_TIMEOUT_MS },
    );
  }

  async markFailed(versionId: string, message: string): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE document_versions
         SET processing_status = 'FAILED'::"ProcessingStatus",
             processing_error = ${message}
       WHERE id = ${versionId}::uuid`;
  }
}