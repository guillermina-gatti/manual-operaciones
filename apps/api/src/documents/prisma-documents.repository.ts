/*Lee y escribe los documentos en PostgreSQL, usando el PrismaService de Magie. Si la base no responde,
devuelve un error que la API convierte en 503 */

import { Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  ConcurrentVersionError,
  DocumentPage,
  DocumentRecord,
  DocumentsRepository,
  DocumentVersionRecord,
  NewDocument,
  NewVersion,
  RepositoryTransaction,
  RepositoryUnavailableError,
  SearchPage,
  SearchParams,
  VersionHistoryRecord,
} from './documents.repository';

// 1. Configuración de tiempos límite estrictos (5 segundos máx para transacciones)
// para evitar que la aplicación se quede colgada si la base se congela.
export const TRANSACTION_TIMEOUT_MS = 5000;
const TRANSACTION_MAX_WAIT_MS = 2000;

// Códigos de error de Prisma que indican que la base de datos NO RESPONDE (conexión caída, timeouts, etc.)
const UNAVAILABLE_CODES = new Set([
  'P1000', // El servidor rechazó el usuario o la contraseña (por ejemplo, otro PostgreSQL en el mismo puerto)
  'P1001', // No se alcanza el servidor
  'P1002', // Timeout al conectar
  'P1008', // Timeout de la operación
  'P1017', // El servidor cerró la conexión
  'P2024', // Timeout esperando una conexión libre en el pool
  'P2028', // Error de transacción (venció su timeout)
]);

// Índices únicos que indican que otra versión nueva se confirmó al mismo tiempo (R8): el de una sola
// CURRENT (T01) y el de (document_id, version_number). Cualquier otro P2002 (por ejemplo, storage_key)
// no es concurrencia y pasa sin traducir.
const CONCURRENT_VERSION_INDEXES = new Set([
  'document_versions_one_current_idx',
  'document_versions_document_id_version_number_key',
]);

// Con el adaptador de pg, el P2002 trae el nombre del índice que chocó en
// meta.driverAdapterError.cause.constraint.index (lo informa PostgreSQL).
function isConcurrentVersionConflict(error: unknown): boolean {
  if (
    !(error instanceof Prisma.PrismaClientKnownRequestError) ||
    error.code !== 'P2002'
  ) {
    return false;
  }
  const meta = error.meta as
    | { driverAdapterError?: { cause?: { constraint?: { index?: string } } } }
    | undefined;
  const index = meta?.driverAdapterError?.cause?.constraint?.index;
  return index !== undefined && CONCURRENT_VERSION_INDEXES.has(index);
}

// Configuración de Prisma para incluir siempre las áreas y únicamente la versión vigente (CURRENT)
const documentInclude = {
  areas: { select: { areaId: true } },
  versions: { where: { status: 'CURRENT' }, take: 1 },
} satisfies Prisma.DocumentInclude;

type DocumentRow = Prisma.DocumentGetPayload<{
  include: typeof documentInclude;
}>;

// 2. Implementación real del repositorio usando Prisma
@Injectable()
export class PrismaDocumentsRepository extends DocumentsRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  // Ejecuta operaciones bajo el principio de "todo o nada" con un límite de tiempo
  runInTransaction<T>(
    fn: (tx: RepositoryTransaction) => Promise<T>,
  ): Promise<T> {
    return this.translate(() =>
      this.prisma.$transaction(
        (tx) => fn(tx as unknown as RepositoryTransaction),
        { timeout: TRANSACTION_TIMEOUT_MS, maxWait: TRANSACTION_MAX_WAIT_MS },
      ),
    );
  }

  // Comprueba si ya hay una versión vigente de un documento activo con el mismo hash (SHA-256)
  findActiveByChecksum(
    checksum: string,
  ): Promise<{ documentId: string } | null> {
    return this.translate(() =>
      this.prisma.documentVersion.findFirst({
        where: { checksum, status: 'CURRENT', document: { status: 'ACTIVE' } },
        select: { documentId: true },
      }),
    );
  }

  // Inserta el documento, sus áreas asociadas y su primera versión de forma atómica en la base de datos
  createWithFirstVersion(
    tx: RepositoryTransaction,
    data: NewDocument,
  ): Promise<DocumentRecord> {
    const client = tx as unknown as Prisma.TransactionClient;
    return this.translate(async () => {
      const row = await client.document.create({
        data: {
          id: data.id,
          title: data.title,
          description: data.description,
          ownerId: data.ownerId,
          reviewDate: data.reviewDate,
          createdById: data.createdById,
          areas: {
            createMany: {
              data: [...new Set(data.areaIds)].map((areaId) => ({ areaId })),
            },
          },
          versions: {
            create: {
              ...data.version,
              versionNumber: 1,
              status: 'CURRENT',
              processingStatus: 'PENDING',
            },
          },
        },
        include: documentInclude,
      });
      return toRecord(row);
    });
  }

  // Devuelve una página de documentos ordenados del más nuevo al más viejo, junto con el total de registros
  list(
    where: Prisma.DocumentWhereInput,
    page: number,
    limit: number,
  ): Promise<DocumentPage> {
    return this.translate(async () => {
      const [rows, total] = await this.prisma.$transaction([
        this.prisma.document.findMany({
          where,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip: (page - 1) * limit,
          take: limit,
          include: documentInclude,
        }),
        this.prisma.document.count({ where }),
      ]);
      return { data: rows.map(toRecord), total };
    });
  }

  // Busca un documento específico por su ID incluyendo sus áreas y su versión vigente
  findByIdWithAreas(id: string): Promise<DocumentRecord | null> {
    return this.translate(async () => {
      const row = await this.prisma.document.findUnique({
        where: { id },
        include: documentInclude,
      });
      return row ? toRecord(row) : null;
    });
  }

  // ── Ciclo de vida (spec 003).

  // Bloquea la fila del documento hasta el fin de la transacción y lo devuelve con sus áreas y su
  // versión vigente (plan 003, 3.3).
  //
  // Son DOS sentencias a propósito; no juntarlas en una. PostgreSQL trabaja en READ COMMITTED: cada
  // sentencia ve lo confirmado en el momento en que empieza. Si el FOR UPDATE y la lectura de la
  // versión vigente fueran una sola consulta (por ejemplo, con un JOIN a document_versions), una
  // transacción que esperó el bloqueo podría recibir la versión vigente de antes de esperar: dejaría
  // pasar un archivo idéntico a la vigente (R6b) o crearía una versión sobre la equivocada (R8).
  // La segunda sentencia empieza cuando el bloqueo ya se obtuvo, así que ve lo que confirmó la otra
  // transacción. Lo prueba "la lectura después del bloqueo ve la versión que confirmó la otra
  // transacción (A y B)" en test/documents/lifecycle.repository.e2e-spec.ts.
  lockForUpdate(
    tx: RepositoryTransaction,
    id: string,
  ): Promise<DocumentRecord | null> {
    const client = tx as unknown as Prisma.TransactionClient;
    return this.translate(async () => {
      // 1. El bloqueo, solo sobre documents.
      const locked = await client.$queryRaw<{ id: string }[]>`
        SELECT id FROM documents WHERE id = ${id}::uuid FOR UPDATE
      `;
      if (locked.length === 0) return null;

      // 2. La lectura, después del bloqueo.
      const row = await client.document.findUnique({
        where: { id },
        include: documentInclude,
      });
      return row ? toRecord(row) : null;
    });
  }

  // Reemplaza las áreas del documento, cambia el responsable si viene y copia las áreas nuevas a
  // todos sus fragmentos, de todas sus versiones (R4, R5). No toca is_active: cambiar áreas no
  // cambia qué versión es la vigente. Todo dentro de la transacción recibida.
  replaceAreas(
    tx: RepositoryTransaction,
    id: string,
    areaIds: string[],
    ownerId?: string,
  ): Promise<DocumentRecord> {
    const client = tx as unknown as Prisma.TransactionClient;
    const uniqueAreaIds = [...new Set(areaIds)];
    return this.translate(async () => {
      await client.documentArea.deleteMany({ where: { documentId: id } });
      await client.documentArea.createMany({
        data: uniqueAreaIds.map((areaId) => ({ documentId: id, areaId })),
      });

      // R5: los fragmentos de TODAS las versiones, también las reemplazadas.
      await client.chunk.updateMany({
        where: { documentId: id },
        data: { areaIds: { set: uniqueAreaIds } },
      });

      const row = await client.document.update({
        where: { id },
        data: { ...(ownerId && { ownerId }), updatedAt: new Date() },
        include: documentInclude,
      });
      return toRecord(row);
    });
  }

  // Reemplaza la versión vigente por una nueva, dentro de la transacción recibida (R7, R7b). El
  // servicio llama antes a lockForUpdate; si alguna escritura no lo hiciera, la base rechaza la
  // segunda CURRENT y se lanza ConcurrentVersionError (R8; plan 003, sección 5).
  addVersion(
    tx: RepositoryTransaction,
    id: string,
    version: NewVersion,
    reviewDate?: Date,
  ): Promise<DocumentRecord> {
    const client = tx as unknown as Prisma.TransactionClient;
    return this.translate(async () => {
      // 1. La vigente pasa a REPLACED. Una sola sentencia que además devuelve cuál era.
      const replaced = await client.$queryRaw<{ id: string }[]>`
        UPDATE document_versions SET status = 'REPLACED'
        WHERE document_id = ${id}::uuid AND status = 'CURRENT'
        RETURNING id
      `;

      // 2. Sus fragmentos dejan de estar activos: ya no es la versión vigente (R7).
      if (replaced.length > 0) {
        await client.chunk.updateMany({
          where: { documentVersionId: { in: replaced.map((row) => row.id) } },
          data: { isActive: false },
        });
      }

      // 3. La nueva, con el número siguiente, en CURRENT y PENDING.
      const { _max } = await client.documentVersion.aggregate({
        where: { documentId: id },
        _max: { versionNumber: true },
      });
      try {
        await client.documentVersion.create({
          data: {
            ...version,
            documentId: id,
            versionNumber: (_max.versionNumber ?? 0) + 1,
            status: 'CURRENT',
            processingStatus: 'PENDING',
          },
        });
      } catch (error) {
        if (isConcurrentVersionConflict(error)) {
          throw new ConcurrentVersionError(
            `Otra versión nueva del documento ${id} se confirmó al mismo tiempo`,
            { cause: error },
          );
        }
        throw error;
      }

      // 4. La fecha de revisión, solo si vino (R7b).
      const row = await client.document.update({
        where: { id },
        data: { ...(reviewDate && { reviewDate }), updatedAt: new Date() },
        include: documentInclude,
      });
      return toRecord(row);
    });
  }

  // Archiva el documento y desactiva los fragmentos de todas sus versiones (R10), dentro de la
  // transacción recibida. No toca las versiones: la vigente sigue siendo CURRENT (spec 003, sección 7).
  archive(
    tx: RepositoryTransaction,
    id: string,
    at: Date,
  ): Promise<DocumentRecord> {
    const client = tx as unknown as Prisma.TransactionClient;
    return this.translate(async () => {
      await client.chunk.updateMany({
        where: { documentId: id },
        data: { isActive: false },
      });
      const row = await client.document.update({
        where: { id },
        data: { status: 'ARCHIVED', archivedAt: at },
        include: documentInclude,
      });
      return toRecord(row);
    });
  }

  // El historial, de la más nueva a la más vieja (R12). Vale también para documentos archivados (D10).
  listVersions(documentId: string): Promise<VersionHistoryRecord[]> {
    return this.translate(async () => {
      const rows = await this.prisma.documentVersion.findMany({
        where: { documentId },
        orderBy: { versionNumber: 'desc' },
      });
      return rows.map((row) => ({
        ...toVersionRecord(row),
        uploadedById: row.uploadedById,
      }));
    });
  }

  // Una versión solo si es de ese documento (R2): así un id de otro documento no se puede descargar.
  findVersion(
    documentId: string,
    versionId: string,
  ): Promise<DocumentVersionRecord | null> {
    return this.translate(async () => {
      const row = await this.prisma.documentVersion.findFirst({
        where: { id: versionId, documentId },
      });
      return row ? toVersionRecord(row) : null;
    });
  }

  // Spec 004 (plan 3.2, D9): dos lecturas en una transacción de solo lectura REPEATABLE READ, así el
  // ranking y los datos de las tarjetas salen de la misma foto de la base.
  search(params: SearchParams): Promise<SearchPage> {
    return this.translate(() =>
      this.prisma.$transaction(
        async (tx) => {
          await tx.$executeRaw`SET TRANSACTION READ ONLY`;

          // Solo quedaron palabras que el español ignora ("de la para"): no hay nada que buscar.
          const [{ nodes }] = await tx.$queryRaw<{ nodes: number }[]>`
            SELECT numnode(${searchQuery(params.text)}) AS nodes
          `;
          if (nodes === 0) return { data: [], total: 0 };

          const rows = await tx.$queryRaw<SearchRow[]>(searchRankingSql(params));
          const total = Number(rows[0]?.total ?? 0);
          const hits = rows.filter((row) => row.id !== null);
          if (hits.length === 0) return { data: [], total };

          const documents = await tx.document.findMany({
            where: { id: { in: hits.map((row) => row.id as string) } },
            include: documentInclude,
          });
          const byId = new Map(documents.map((row) => [row.id, toRecord(row)]));

          // El orden es el del ranking (R9); findMany no lo conserva.
          const data = hits.flatMap((row) => {
            const record = byId.get(row.id as string);
            if (!record) return [];
            const fragment =
              row.marked_text === null
                ? null
                : { markedText: row.marked_text, pageNumber: row.page_number };
            return [{ record, fragment }];
          });
          return { data, total };
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
          timeout: TRANSACTION_TIMEOUT_MS,
          maxWait: TRANSACTION_MAX_WAIT_MS,
        },
      ),
    );
  }

  // Función envoltorio: Si Prisma lanza un error de conexión o timeout,
  // lo traduce a RepositoryUnavailableError (para que la API devuelva un HTTP 503).
  // Cualquier otro error de base de datos (ej. datos duplicados) pasa tal cual.
  private async translate<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (isUnavailable(error)) {
        throw new RepositoryUnavailableError('La base de datos no responde', {
          cause: error,
        });
      }
      throw error;
    }
  }
}

// ── Búsqueda (spec 004, plan sección 3) ─────────────────────────────────────────────────────────

// Una fila del ranking: siempre hay una, con el total; id es null si la página está vacía.
interface SearchRow {
  total: bigint;
  id: string | null;
  page_number: number | null;
  marked_text: string | null;
}

// D4: el texto del usuario va siempre como parámetro y plainto_tsquery lo toma como texto: ignora la
// puntuación (", &, |, !, :, <->, *) y une las palabras con "y" (R6). Ni to_tsquery (su sintaxis da
// error) ni websearch_to_tsquery (interpreta comillas, - y or). Se escribe en línea en cada uso, no en
// un CTE: con el valor del parámetro, el planificador la calcula como constante y puede usar el índice.
const searchQuery = (text: string) =>
  Prisma.sql`plainto_tsquery('es_unaccent'::regconfig, ${text})`;

// La misma expresión que el índice chunks_content_fts_es_unaccent_idx: si cambia, deja de usarlo.
const chunkVector = Prisma.sql`to_tsvector('es_unaccent'::regconfig, c.content)`;

// Marcadores de search-fragment.ts (U+E000 y U+E001), escritos con chr() para no depender de cómo se
// pasen caracteres de uso privado en el texto de la consulta.
const MARK_START_SQL = Prisma.sql`chr(57344)`;
const MARK_END_SQL = Prisma.sql`chr(57345)`;

// La consulta del ranking (plan 3.4). Exportada para el test del índice (EXPLAIN).
export function searchRankingSql({ text, scope, page, limit }: SearchParams): Prisma.Sql {
  const tsq = searchQuery(text);
  const areaIds = scope.areaIds;

  // R3: si no es ADMIN, el documento tiene que compartir un área (document_areas decide) y, como
  // defensa, también las áreas copiadas en el fragmento (D5).
  const documentAreas =
    areaIds === null
      ? Prisma.empty
      : Prisma.sql`AND EXISTS (
          SELECT 1 FROM document_areas da
          WHERE da.document_id = d.id AND da.area_id = ANY(${areaIds}::uuid[]))`;
  const chunkAreas =
    areaIds === null ? Prisma.empty : Prisma.sql`AND c.area_ids && ${areaIds}::uuid[]`;

  return Prisma.sql`
    WITH visible AS (
      -- R3: solo ACTIVE, para todos los roles, con su versión vigente
      SELECT d.id, d.created_at, dv.id AS version_id,
             to_tsvector('es_unaccent'::regconfig, d.title) AS title_vector,
             setweight(to_tsvector('es_unaccent'::regconfig, d.title), 'A') ||
             setweight(to_tsvector('es_unaccent'::regconfig, coalesce(d.description, '')), 'B')
               AS doc_vector
      FROM documents d
      JOIN document_versions dv ON dv.document_id = d.id AND dv.status = 'CURRENT'
      WHERE d.status = 'ACTIVE'
      ${documentAreas}
    ),
    best_chunk AS (
      -- R2 y R7: el fragmento activo de la versión vigente que mejor coincide, uno por documento
      SELECT DISTINCT ON (c.document_id)
             c.document_id, c.id AS chunk_id, c.page_number,
             ts_rank(${chunkVector}, ${tsq}) AS chunk_rank
      FROM chunks c
      JOIN visible v ON v.id = c.document_id AND v.version_id = c.document_version_id
      WHERE c.is_active
        AND ${chunkVector} @@ ${tsq}
        ${chunkAreas}
      ORDER BY c.document_id, chunk_rank DESC, c.chunk_index
    ),
    hits AS (
      -- D16: todas las palabras entre el título y la descripción, o todas en un mismo fragmento
      SELECT v.id, v.created_at, b.chunk_id, b.page_number,
             v.title_vector @@ ${tsq} AS in_title,
             (CASE WHEN v.doc_vector @@ ${tsq} THEN ts_rank(v.doc_vector, ${tsq}) ELSE 0 END)
               + coalesce(b.chunk_rank, 0) AS relevance
      FROM visible v
      LEFT JOIN best_chunk b ON b.document_id = v.id
      WHERE v.doc_vector @@ ${tsq} OR b.chunk_id IS NOT NULL
    )
    SELECT t.total, p.id, p.page_number,
           -- R8 y R11: el fragmento completo, sin cambios y con marcadores; el recorte lo hace
           -- buildFragment. HighlightAll no reemplaza las etiquetas HTML del texto por espacios.
           ts_headline('es_unaccent'::regconfig,
                       translate(c.content, ${MARK_START_SQL} || ${MARK_END_SQL}, ''),
                       ${tsq},
                       'HighlightAll=true, StartSel=' || ${MARK_START_SQL}
                         || ', StopSel=' || ${MARK_END_SQL})
             AS marked_text
    FROM (SELECT count(*) AS total FROM hits) t
    LEFT JOIN LATERAL (
      -- R9 y D6: título primero, después relevancia, el más nuevo y el id (orden estable)
      SELECT * FROM hits
      ORDER BY in_title DESC, relevance DESC, created_at DESC, id DESC
      LIMIT ${limit} OFFSET ${(page - 1) * limit}
    ) p ON true
    LEFT JOIN chunks c ON c.id = p.chunk_id
    ORDER BY p.in_title DESC, p.relevance DESC, p.created_at DESC, p.id DESC
  `;
}

// Error del driver pg cuando el servidor corta la conexión sin que la aplicación lo pida
// (pg/lib/client.js). No trae código, y @prisma/adapter-pg lo deja pasar sin convertir:
// pasa, por ejemplo, si la base se cae en medio de una transacción.
const PG_CONNECTION_LOST = 'Connection terminated unexpectedly';

// Comprueba si el error de Prisma corresponde a un problema de disponibilidad del servidor
function isUnavailable(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientInitializationError) return true;
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    UNAVAILABLE_CODES.has(error.code)
  ) {
    return true;
  }
  return (
    error instanceof Error &&
    !('code' in error) &&
    error.message === PG_CONNECTION_LOST
  );
}

// Transforma el resultado crudo de Prisma en el objeto limpio `DocumentRecord` que usa la app
function toRecord(row: DocumentRow): DocumentRecord {
  const [version] = row.versions;
  if (!version) {
    throw new Error(`El documento ${row.id} no tiene versión CURRENT`);
  }
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    areaIds: row.areas.map((area) => area.areaId),
    ownerId: row.ownerId,
    reviewDate: row.reviewDate,
    createdById: row.createdById,
    createdAt: row.createdAt,
    archivedAt: row.archivedAt,
    currentVersion: toVersionRecord(version),
  };
}

// Campo por campo, como toRecord: un campo interno nuevo de la tabla no llega a los servicios.
function toVersionRecord(
  version: DocumentRow['versions'][number],
): DocumentVersionRecord {
  return {
    id: version.id,
    versionNumber: version.versionNumber,
    status: version.status,
    storageKey: version.storageKey,
    originalFileName: version.originalFileName,
    mimeType: version.mimeType,
    sizeBytes: version.sizeBytes,
    checksum: version.checksum,
    processingStatus: version.processingStatus,
    createdAt: version.createdAt,
  };
}
