import type {
  DocumentStatus,
  DocumentVersionStatus,
  Prisma,
  ProcessingStatus,
} from '../generated/prisma/client';

// La base no responde (conexión o timeout); el servicio lo convierte en 503 (R8).
export class RepositoryUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'RepositoryUnavailableError';
  }
}

declare const transactionBrand: unique symbol;

// Transacción opaca (D10): los servicios solo la reciben y la pasan; no pueden leerla ni crearla.
// PrismaDocumentsRepository (T18) convierte su Prisma.TransactionClient a este tipo.
export type RepositoryTransaction = { readonly [transactionBrand]: true };

// Lo que el servicio entrega para crear un documento. Los ids los genera el servicio antes de
// subir el archivo (plan 4, paso 4); versionNumber = 1, CURRENT y PENDING los fija el repositorio.
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

// Incluye storageKey y checksum para uso interno; la respuesta HTTP no los expone (plan 3.1).
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

export interface DocumentPage {
  data: DocumentRecord[];
  total: number;
}

// Puerto (D10, plan 5.6). La implementación con Prisma es T18 y está bloqueada hasta que exista PrismaService.
// Cualquier método puede rechazar con RepositoryUnavailableError: la implementación traduce a ese error
// los fallos de conexión y de timeout (también el de la transacción). Los demás errores no se traducen.
export abstract class DocumentsRepository {
  // Todo o nada (R7, R8): si fn lanza, se deshace todo lo escrito con tx.
  abstract runInTransaction<T>(
    fn: (tx: RepositoryTransaction) => Promise<T>,
  ): Promise<T>;

  // Versión CURRENT de un documento ACTIVE con el mismo SHA-256 (R8b).
  abstract findActiveByChecksum(
    checksum: string,
  ): Promise<{ documentId: string } | null>;

  // Inserta documents, document_areas y la primera document_versions (R7).
  abstract createWithFirstVersion(
    tx: RepositoryTransaction,
    data: NewDocument,
  ): Promise<DocumentRecord>;

  // Página ordenada por createdAt descendente y, si empatan, por id; data y total con el mismo filtro (R13).
  abstract list(
    where: Prisma.DocumentWhereInput,
    page: number,
    limit: number,
  ): Promise<DocumentPage>;

  // Documento con sus áreas y su versión vigente, o null si no existe (R10, R11, R12).
  abstract findByIdWithAreas(id: string): Promise<DocumentRecord | null>;
}
