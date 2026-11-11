// Búsqueda vectorial con pgvector. El filtro por área y por vigencia va en la misma consulta SQL,
// así la IA nunca recibe fragmentos de áreas que el usuario no tiene (ver justificacion.md).
import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ChatRetrieval, type RetrievedChunk } from '../ports/chat-retrieval';

interface ChunkRow {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  versionId: string;
  versionNumber: number;
  section: string | null;
  content: string;
  validFrom: Date;
  distance: number;
  storageKey: string;
  fileName: string;
}

@Injectable()
export class PrismaChatRetrieval extends ChatRetrieval {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async search(queryVector: number[], areaIds: string[] | null, limit: number, focusArea?: string): Promise<RetrievedChunk[]> {
    if (areaIds !== null && areaIds.length === 0) return [];
    const vector = `[${queryVector.join(',')}]`;
    // null = sin filtro por área (solo ADMIN). Los demás roles siempre filtran en SQL.
    const areaFilter = areaIds === null ? Prisma.empty : Prisma.sql`AND c.area_ids && ${areaIds}::uuid[]`;
    // Área nombrada en la pregunta: solo sus documentos. Si no existe o el usuario no la tiene, no devuelve nada.
    const focusFilter =
      focusArea === undefined
        ? Prisma.empty
        : Prisma.sql`AND c.area_ids && ARRAY(SELECT a.id FROM areas a WHERE lower(a.name) = lower(${focusArea}))`;

    const rows = await this.prisma.$queryRaw<ChunkRow[]>(Prisma.sql`
      SELECT c.id AS "chunkId",
             c.document_id AS "documentId",
             d.title AS "documentTitle",
             v.id AS "versionId",
             v.version_number AS "versionNumber",
             c.section,
             c.content,
             v.created_at AS "validFrom",
             v.storage_key AS "storageKey",
             v.original_file_name AS "fileName",
             c.embedding <=> ${vector}::vector AS distance
      FROM chunks c
      JOIN document_versions v ON v.id = c.document_version_id
      JOIN documents d ON d.id = c.document_id
      WHERE c.is_active = true
        AND d.status = 'ACTIVE'
        AND v.status = 'CURRENT'
        AND v.processing_status = 'READY'
        ${areaFilter}
        ${focusFilter}
      ORDER BY c.embedding <=> ${vector}::vector
      LIMIT ${limit}
    `);

    return rows.map((row) => ({
      ...row,
      validFrom: new Date(row.validFrom).toISOString().slice(0, 10),
      distance: Number(row.distance),
    }));
  }
}