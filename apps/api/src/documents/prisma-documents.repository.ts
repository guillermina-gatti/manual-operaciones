/*Lee y escribe los documentos en PostgreSQL, usando el PrismaService de Magie. Si la base no responde,
devuelve un error que la API convierte en 503 */

import { Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  DocumentPage,
  DocumentRecord,
  DocumentsRepository,
  DocumentVersionRecord,
  NewDocument,
  NewVersion,
  RepositoryTransaction,
  RepositoryUnavailableError,
  VersionHistoryRecord,
} from './documents.repository';

// Para los métodos del contrato que todavía no tienen implementación (T05).
const notImplemented = <T>(method: string, task: string): Promise<T> =>
  Promise.reject(
    new Error(
      `PrismaDocumentsRepository.${method} todavía no está implementado (spec 003, ${task})`,
    ),
  );

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

  // ── Ciclo de vida (spec 003). Pendientes del contrato (T05): T07 (addVersion) y
  // T08 (archive, listVersions, findVersion).

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

  addVersion(
    _tx: RepositoryTransaction,
    _id: string,
    _version: NewVersion,
    _reviewDate?: Date,
  ): Promise<DocumentRecord> {
    return notImplemented('addVersion', 'T07');
  }

  archive(
    _tx: RepositoryTransaction,
    _id: string,
    _at: Date,
  ): Promise<DocumentRecord> {
    return notImplemented('archive', 'T08');
  }

  listVersions(_documentId: string): Promise<VersionHistoryRecord[]> {
    return notImplemented('listVersions', 'T08');
  }

  findVersion(
    _documentId: string,
    _versionId: string,
  ): Promise<DocumentVersionRecord | null> {
    return notImplemented('findVersion', 'T08');
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
    currentVersion: {
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
    },
  };
}
