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
  currentVersion: DocumentVersionRecord;
}

// Estructura para manejar resultados paginados
export interface DocumentPage {
  data: DocumentRecord[];
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
}
