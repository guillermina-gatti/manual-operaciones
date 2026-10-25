/* Define cómo los servicios leen y escriben en la base, sin depender de Prisma */

import type {
  DocumentStatus,
  DocumentVersionStatus,
  Prisma,
  ProcessingStatus,
} from '../generated/prisma/client';

// 1. Error personalizado: Si la base de datos no responde por timeout o conexión,
// el repositorio lanza esto para que el servicio lo convierta en un HTTP 503 (Regla R8).
export class RepositoryUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'RepositoryUnavailableError';
  }
}

// Spec 003, R8: otra versión nueva se confirmó al mismo tiempo y la base rechazó una segunda CURRENT
// (índice document_versions_one_current_idx) o un número de versión repetido. El servicio lo
// convierte en 409 CONCURRENT_VERSION (plan 003, secciones 4 y 5).
export class ConcurrentVersionError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'ConcurrentVersionError';
  }
}

declare const transactionBrand: unique symbol;

// 2. Transacción opaca (D10): Los servicios solo la reciben y la pasan sin poder manipularla.
// (La implementación real con Prisma convertirá su cliente de transacción a este tipo).
export type RepositoryTransaction = { readonly [transactionBrand]: true };

// 3. Estructura con los datos que entrega el servicio para dar de alta un documento nuevo.
export interface NewDocument {
  id: string;
  title: string;
  description: string | null;
  areaIds: string[];
  ownerId: string;
  reviewDate: Date;
  createdById: string;
  version: {
    id: string;
    storageKey: string;
    originalFileName: string;
    mimeType: string;
    sizeBytes: number;
    checksum: string;
    uploadedById: string;
  };
}

// Estructura de los registros de la versión de un documento
export interface DocumentVersionRecord {
  id: string;
  versionNumber: number;
  status: DocumentVersionStatus;
  storageKey: string;
  originalFileName: string;
  mimeType: string;
  sizeBytes: number;
  checksum: string;
  processingStatus: ProcessingStatus;
  createdAt: Date;
}

// Estructura completa de un documento recuperado de la base de datos
export interface DocumentRecord {
  id: string;
  title: string;
  description: string | null;
  status: DocumentStatus;
  areaIds: string[];
  ownerId: string;
  reviewDate: Date;
  createdById: string;
  createdAt: Date;
  // Cuándo se archivó (spec 003, R10). El repositorio real lo completa siempre (null si está activo);
  // es opcional para los registros armados a mano en los tests.
  archivedAt?: Date | null;
  currentVersion: DocumentVersionRecord;
}

// Estructura para manejar resultados paginados
export interface DocumentPage {
  data: DocumentRecord[];
  total: number;
}

// Spec 003: los datos de una versión nueva. Son los mismos que los de la primera versión de la carga;
// el número, el estado CURRENT y el procesamiento PENDING los pone el repositorio (R7).
export type NewVersion = NewDocument['version'];

// Spec 003, R12: una fila del historial. Además de lo de una versión, quién la subió.
export interface VersionHistoryRecord extends DocumentVersionRecord {
  uploadedById: string;
}

// Spec 004: qué se busca. `scope` sale de searchScope (document-access.policy): areaIds null = sin
// filtro de áreas (ADMIN). El estado ACTIVE se exige siempre (R3).
export interface SearchParams {
  text: string;
  scope: { areaIds: string[] | null };
  page: number;
  limit: number;
}

// El fragmento que mejor coincide, con las palabras entre los marcadores de search-fragment.ts
// (plan 004, 4.2). null si la coincidencia es solo en el título o la descripción (R8).
export interface SearchHit {
  record: DocumentRecord;
  fragment: { markedText: string; pageNumber: number | null } | null;
}

// Una página de resultados, en orden de relevancia (R9), y el total de documentos (R7, R10).
export interface SearchPage {
  data: SearchHit[];
  total: number;
}

// 4. Puerto (Contrato abstracto): Define los métodos obligatorios que debe tener
// cualquier repositorio de base de datos que conectemos al sistema.
export abstract class DocumentsRepository {
  // Garantiza "todo o nada" (R7, R8): si algo falla dentro del callback, la transacción se revierte.
  abstract runInTransaction<T>(
    fn: (tx: RepositoryTransaction) => Promise<T>,
  ): Promise<T>;

  // Busca si existe un documento activo con el mismo hash (SHA-256) para evitar duplicados (R8b).
  abstract findActiveByChecksum(
    checksum: string,
  ): Promise<{ documentId: string } | null>;

  // Inserta el documento, sus relaciones de áreas y su primera versión de forma atómica (R7).
  abstract createWithFirstVersion(
    tx: RepositoryTransaction,
    data: NewDocument,
  ): Promise<DocumentRecord>;

  // Devuelve una página de documentos ordenados por fecha de creación (R13).
  abstract list(
    where: Prisma.DocumentWhereInput,
    page: number,
    limit: number,
  ): Promise<DocumentPage>;

  // Busca un documento por ID junto con sus áreas y su versión vigente (o null si no existe).
  abstract findByIdWithAreas(id: string): Promise<DocumentRecord | null>;

  // ── Ciclo de vida (spec 003). Las escrituras reciben la transacción opaca, como createWithFirstVersion.

  // Bloquea la fila del documento hasta el fin de la transacción (SELECT … FOR UPDATE) y lo devuelve
  // con sus áreas y su versión vigente, o null si no existe (plan 003, 3.3).
  abstract lockForUpdate(
    tx: RepositoryTransaction,
    id: string,
  ): Promise<DocumentRecord | null>;

  // Reemplaza las áreas, cambia el responsable si viene y copia las áreas nuevas a todos los
  // fragmentos del documento, de todas sus versiones (R4, R5).
  abstract replaceAreas(
    tx: RepositoryTransaction,
    id: string,
    areaIds: string[],
    ownerId?: string,
  ): Promise<DocumentRecord>;

  // Pasa la versión vigente a REPLACED y desactiva sus fragmentos, crea la nueva con el número
  // siguiente en CURRENT y PENDING, y cambia la fecha de revisión si viene (R7, R7b).
  // Lanza ConcurrentVersionError si la base rechaza una segunda CURRENT (R8).
  abstract addVersion(
    tx: RepositoryTransaction,
    id: string,
    version: NewVersion,
    reviewDate?: Date,
  ): Promise<DocumentRecord>;

  // Pasa el documento a ARCHIVED con su fecha y desactiva todos sus fragmentos (R10).
  abstract archive(
    tx: RepositoryTransaction,
    id: string,
    at: Date,
  ): Promise<DocumentRecord>;

  // El historial de versiones del documento, de la más nueva a la más vieja (R12).
  abstract listVersions(documentId: string): Promise<VersionHistoryRecord[]>;

  // Una versión, solo si pertenece a ese documento; null si no (R2, R12).
  abstract findVersion(
    documentId: string,
    versionId: string,
  ): Promise<DocumentVersionRecord | null>;

  // ── Búsqueda (spec 004, plan sección 3).

  // Los documentos ACTIVE del alcance que coinciden en el título y la descripción o en un fragmento
  // activo de su versión vigente, uno por documento, en orden de relevancia (R2, R3, R6, R7, R9, R10).
  abstract search(params: SearchParams): Promise<SearchPage>;
}
