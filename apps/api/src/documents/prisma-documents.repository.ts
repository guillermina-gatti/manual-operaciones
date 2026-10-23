/* Implementa DocumentsRepository con el PrismaService compartido (T18, plan 5.6) */

import { Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  DocumentPage,
  DocumentRecord,
  DocumentsRepository,
  NewDocument,
  RepositoryTransaction,
  RepositoryUnavailableError,
} from './documents.repository';

// Timeout corto de la transacción de carga (D10, D12): si la base o el encolado se cuelgan,
// la carga responde 503 en vez de quedar esperando.
export const TRANSACTION_TIMEOUT_MS = 5000;
const TRANSACTION_MAX_WAIT_MS = 2000;

// Códigos de Prisma que significan "la base no responde", no "la consulta está mal":
// P1001 no se alcanza el servidor, P1002 timeout al conectar, P1008 timeout de la operación,
// P1017 el servidor cerró la conexión, P2024 timeout esperando una conexión del pool,
// P2028 error de la transacción (entre ellos, que venció su timeout).
const UNAVAILABLE_CODES = new Set([
  'P1001',
  'P1002',
  'P1008',
  'P1017',
  'P2024',
  'P2028',
]);

// Lo que se lee de cada documento: sus áreas y solo su versión vigente.
const documentInclude = {
  areas: { select: { areaId: true } },
  versions: { where: { status: 'CURRENT' }, take: 1 },
} satisfies Prisma.DocumentInclude;

type DocumentRow = Prisma.DocumentGetPayload<{
  include: typeof documentInclude;
}>;

@Injectable()
export class PrismaDocumentsRepository extends DocumentsRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  // Todo o nada (R7, R8): si fn lanza, Prisma deshace lo escrito con tx.
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

  // Duplicado (R8b): solo cuenta la versión CURRENT de un documento ACTIVE;
  // un archivado no impide volver a cargar el mismo archivo.
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

  // Inserta documents, document_areas y la primera document_versions en el tx (R7, plan 2.3).
  // versionNumber, status y processingStatus los fija el repositorio, no el servicio.
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

  // Página del listado (R13): del más nuevo al más viejo, con id para desempatar,
  // y el total con el mismo where. Las dos consultas van juntas para que coincidan.
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

  // Detalle y descarga (R10, R11, R12): quién puede verlo lo decide el servicio.
  findByIdWithAreas(id: string): Promise<DocumentRecord | null> {
    return this.translate(async () => {
      const row = await this.prisma.document.findUnique({
        where: { id },
        include: documentInclude,
      });
      return row ? toRecord(row) : null;
    });
  }

  // Fallos de conexión y de timeout → RepositoryUnavailableError (el servicio responde 503).
  // Cualquier otro error, por ejemplo una violación de unicidad, sale tal cual.
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

function isUnavailable(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientInitializationError) return true;
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    UNAVAILABLE_CODES.has(error.code)
  );
}

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
