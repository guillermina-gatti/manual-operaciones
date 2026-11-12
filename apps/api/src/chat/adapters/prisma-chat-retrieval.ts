// Búsqueda híbrida con pgvector: similitud (embedding de la pregunta) y palabras (texto completo en español),
// fusionadas con Reciprocal Rank Fusion. El filtro por área y por vigencia va en la misma consulta SQL, así la
// IA nunca recibe fragmentos de áreas que el usuario no tiene (ver justificacion.md).
import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ChatRetrieval, type RetrievedChunk } from '../ports/chat-retrieval';

// Cuántos candidatos aporta cada búsqueda (similitud y palabras) antes de fusionarlas.
const CANDIDATES = 20;
// Constante de RRF: suaviza la diferencia entre el primer y el segundo puesto (60 es el valor habitual).
const RRF_K = 60;

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
  lexical: boolean;
}

@Injectable()
export class PrismaChatRetrieval extends ChatRetrieval {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async search(
    queryVector: number[],
    areaIds: string[] | null,
    limit: number,
    focusArea?: string,
    queryText?: string,
  ): Promise<RetrievedChunk[]> {
    if (areaIds !== null && areaIds.length === 0) return [];
    const vector = `[${queryVector.join(',')}]`;
    const text = queryText?.trim() ?? '';
    // null = sin filtro por área (solo ADMIN). Los demás roles siempre filtran en SQL.
    const areaFilter = areaIds === null ? Prisma.empty : Prisma.sql`AND c.area_ids && ${areaIds}::uuid[]`;
    // Área nombrada en la pregunta: solo sus documentos. Si no existe o el usuario no la tiene, no devuelve nada.
    const focusFilter =
      focusArea === undefined
        ? Prisma.empty
        : Prisma.sql`AND c.area_ids && ARRAY(SELECT a.id FROM areas a WHERE lower(a.name) = lower(${focusArea}))`;

    // base: los fragmentos que el usuario puede consultar (mismos filtros que antes).
    // semantic: los más parecidos por embedding. lexical: los que contienen las palabras de la pregunta.
    // fused: la fusión RRF de ambos rankings. Solo se devuelven las columnas de texto (nunca vectores).
    const rows = await this.prisma.$queryRaw<ChunkRow[]>(Prisma.sql`
      WITH base AS (
        SELECT c.id,
               c.document_id,
               d.title,
               v.id AS version_id,
               v.version_number,
               c.section,
               c.content,
               v.created_at,
               v.storage_key,
               v.original_file_name,
               c.content_tsv,
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
      ),
      semantic AS (
        SELECT id, ROW_NUMBER() OVER (ORDER BY distance) AS rnk
        FROM base
        ORDER BY distance
        LIMIT ${CANDIDATES}
      ),
      lexical AS (
        SELECT b.id, ROW_NUMBER() OVER (ORDER BY ts_rank(b.content_tsv, q.query) DESC) AS rnk
        FROM base b, websearch_to_tsquery('spanish', ${text}) AS q(query)
        WHERE b.content_tsv @@ q.query
        ORDER BY ts_rank(b.content_tsv, q.query) DESC
        LIMIT ${CANDIDATES}
      ),
      fused AS (
        SELECT COALESCE(s.id, l.id) AS id,
               COALESCE(1.0 / (${RRF_K} + s.rnk), 0) + COALESCE(1.0 / (${RRF_K} + l.rnk), 0) AS score,
               l.id IS NOT NULL AS lexical
        FROM semantic s
        FULL OUTER JOIN lexical l ON l.id = s.id
      )
      SELECT b.id AS "chunkId",
             b.document_id AS "documentId",
             b.title AS "documentTitle",
             b.version_id AS "versionId",
             b.version_number AS "versionNumber",
             b.section,
             b.content,
             b.created_at AS "validFrom",
             b.storage_key AS "storageKey",
             b.original_file_name AS "fileName",
             b.distance,
             f.lexical
      FROM fused f
      JOIN base b ON b.id = f.id
      ORDER BY f.score DESC
      LIMIT ${limit}
    `);

    return rows.map((row) => ({
      chunkId: row.chunkId,
      documentId: row.documentId,
      documentTitle: row.documentTitle,
      versionId: row.versionId,
      versionNumber: row.versionNumber,
      section: row.section,
      content: row.content,
      storageKey: row.storageKey,
      fileName: row.fileName,
      validFrom: new Date(row.validFrom).toISOString().slice(0, 10),
      distance: Number(row.distance),
      lexical: Boolean(row.lexical),
    }));
  }
}