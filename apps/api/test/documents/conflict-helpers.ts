/* Spec 011 (T09): documentos con fragmentos que el chat puede recuperar, versiones nuevas y alertas
sembradas directo en la base de tests. Lo que se crea acá lo borra cleanDocuments (las alertas, por
sus FK con ON DELETE CASCADE) */

import { randomUUID } from 'node:crypto';
import { FIXTURE_USERS } from '../../src/documents/adapters/fixtures';
import type { PrismaService } from '../../src/prisma/prisma.service';
import { VECTOR } from '../chat/helpers';
import { seedDocument, seedProcessedVersion } from './helpers';

export interface ChunkedDocument {
  id: string;
  versionId: string;
  chunkId: string;
}

// Les pone a los fragmentos de una versión el vector de FixedEmbeddings: distancia 0 a la pregunta.
async function embed(prisma: PrismaService, versionId: string): Promise<void> {
  await prisma.$executeRawUnsafe(
    `UPDATE chunks SET embedding = $1::vector WHERE document_version_id = $2::uuid`,
    `[${VECTOR.join(',')}]`,
    versionId,
  );
}

// Un documento activo con un solo fragmento, vigente y procesado. Uno por documento: así S1 y S2
// siempre son de documentos distintos, aunque la distancia empate.
export async function seedChunkedDocument(
  prisma: PrismaService,
  opts: { areaIds: string[]; title: string; content: string },
): Promise<ChunkedDocument> {
  const doc = await seedDocument(prisma, {
    areaIds: opts.areaIds,
    title: opts.title,
  });
  const [chunkId] = await seedProcessedVersion(prisma, {
    documentId: doc.id,
    versionId: doc.versionId,
    areaIds: opts.areaIds,
    contents: [opts.content],
  });
  await embed(prisma, doc.versionId);
  return { id: doc.id, versionId: doc.versionId, chunkId };
}

// Una versión nueva, vigente y procesada, con un fragmento. La anterior pasa a REPLACED. Con
// keepOldChunksActive, los fragmentos viejos quedan is_active = true, para probar que la
// recuperación filtra también por el estado de la versión (R1).
export async function seedNewVersion(
  prisma: PrismaService,
  doc: ChunkedDocument,
  opts: {
    areaIds: string[];
    content: string;
    versionNumber?: number;
    keepOldChunksActive?: boolean;
  },
): Promise<ChunkedDocument> {
  const versionId = randomUUID();
  await prisma.$transaction([
    prisma.documentVersion.update({
      where: { id: doc.versionId },
      data: { status: 'REPLACED' },
    }),
    prisma.chunk.updateMany({
      where: { documentVersionId: doc.versionId },
      data: { isActive: opts.keepOldChunksActive ?? false },
    }),
    prisma.documentVersion.create({
      data: {
        id: versionId,
        documentId: doc.id,
        versionNumber: opts.versionNumber ?? 2,
        storageKey: `documents/${doc.id}/${versionId}.pdf`,
        originalFileName: 'nueva.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1024,
        checksum: randomUUID().replace(/-/g, '').padEnd(64, '0'),
        uploadedById: FIXTURE_USERS.admin.id,
      },
    }),
  ]);
  const [chunkId] = await seedProcessedVersion(prisma, {
    documentId: doc.id,
    versionId,
    areaIds: opts.areaIds,
    contents: [opts.content],
  });
  await embed(prisma, versionId);
  return { id: doc.id, versionId, chunkId };
}

export interface AlertRow {
  id: string;
  document_a_id: string;
  document_b_id: string;
  version_a_id: string;
  version_b_id: string;
  question: string;
  status: 'OPEN' | 'RESOLVED';
  occurrences: number;
  resolved_by_id: string | null;
  resolution_note: string | null;
}

export function readAlerts(prisma: PrismaService): Promise<AlertRow[]> {
  return prisma.$queryRaw<AlertRow[]>`
    SELECT id, document_a_id, document_b_id, version_a_id, version_b_id, question,
           status::text AS status, occurrences, resolved_by_id, resolution_note
    FROM document_conflict_alerts
    ORDER BY first_detected_at, id
  `;
}

// Una alerta entre x e y, con el par en orden (R11), sembrada con SQL.
export async function insertAlert(
  prisma: PrismaService,
  x: ChunkedDocument,
  y: ChunkedDocument,
  opts: {
    status?: 'OPEN' | 'RESOLVED';
    question?: string;
    lastDetectedAt?: Date;
    resolvedAt?: Date;
  } = {},
): Promise<string> {
  const [a, b] = [x, y].sort((p, q) => (p.id < q.id ? -1 : 1));
  const id = randomUUID();
  const resolved = opts.status === 'RESOLVED';
  await prisma.$executeRaw`
    INSERT INTO document_conflict_alerts
      (id, document_a_id, document_b_id, version_a_id, version_b_id, chunk_a_id, chunk_b_id,
       message_id, question, status, last_detected_at, resolved_at, resolved_by_id)
    VALUES
      (${id}::uuid, ${a.id}::uuid, ${b.id}::uuid, ${a.versionId}::uuid, ${b.versionId}::uuid,
       ${a.chunkId}::uuid, ${b.chunkId}::uuid, ${randomUUID()}::uuid,
       ${opts.question ?? '¿Quién aprueba una compra?'},
       ${opts.status ?? 'OPEN'}::"ConflictAlertStatus", ${opts.lastDetectedAt ?? new Date()},
       ${resolved ? (opts.resolvedAt ?? new Date()) : null},
       ${resolved ? FIXTURE_USERS.admin.id : null}::uuid)
  `;
  return id;
}

export async function resolveAlert(
  prisma: PrismaService,
  id: string,
): Promise<void> {
  await prisma.$executeRaw`
    UPDATE document_conflict_alerts
    SET status = 'RESOLVED', resolved_at = now(), resolved_by_id = ${FIXTURE_USERS.admin.id}::uuid
    WHERE id = ${id}::uuid
  `;
}
