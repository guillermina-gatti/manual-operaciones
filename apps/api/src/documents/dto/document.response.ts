// Clases DTO y funciones de mapeo para estructurar las respuestas de documentos, versiones y búsquedas hacia el cliente.
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  DocumentStatus,
  DocumentVersionStatus,
  ProcessingStatus,
} from '../../generated/prisma/enums';
import type {
  DocumentRecord,
  DocumentVersionRecord,
  VersionHistoryRecord,
} from '../documents.repository';
import type {
  DocumentReviewInfo as ReviewInfo,
  ReviewStatus,
} from '../review-status';

// Forma de la respuesta del plan 3.1. storageKey y checksum son internos y no forman parte de ella.
export class DocumentVersionResponse {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 1 })
  versionNumber: number;

  @ApiProperty({ enum: DocumentVersionStatus })
  status: DocumentVersionStatus;

  @ApiProperty({ example: 'manual.pdf' })
  originalFileName: string;

  @ApiProperty({ example: 'application/pdf' })
  mimeType: string;

  @ApiProperty({ example: 2097152 })
  sizeBytes: number;

  @ApiProperty({ enum: ProcessingStatus })
  processingStatus: ProcessingStatus;

  @ApiProperty({ format: 'date-time' })
  createdAt: string;
}

// Versión resumida para el listado (plan 3.2).
export class DocumentVersionSummary {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 1 })
  versionNumber: number;

  @ApiProperty({ example: 'manual.pdf' })
  originalFileName: string;

  @ApiProperty({ example: 'application/pdf' })
  mimeType: string;

  @ApiProperty({ enum: ProcessingStatus })
  processingStatus: ProcessingStatus;
}

// Una fila del historial (spec 003, plan 1.4): la versión y quién la subió.
export class VersionHistoryItem extends DocumentVersionResponse {
  @ApiProperty({ format: 'uuid' })
  uploadedById: string;
}

// Spec 005 (plan 2.1): el estado de revisión y la última revisión. Solo lo recibe el ADMIN o el
// responsable del documento (R4).
export class DocumentReviewInfo implements ReviewInfo {
  @ApiProperty({
    enum: ['UP_TO_DATE', 'DUE_SOON', 'OVERDUE'],
    nullable: true,
    description: 'null si el documento está archivado (R2)',
  })
  status: ReviewStatus | null;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description: 'null si nunca se revisó (R11)',
  })
  lastReviewedAt: string | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  lastReviewedById: string | null;
}

class DocumentFields {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'Manual de caja' })
  title: string;

  @ApiProperty({ type: String, nullable: true })
  description: string | null;

  @ApiProperty({ enum: DocumentStatus })
  status: DocumentStatus;

  @ApiProperty({ type: [String], format: 'uuid' })
  areaIds: string[];

  @ApiProperty({ format: 'uuid' })
  ownerId: string;

  @ApiProperty({ format: 'date', example: '2027-03-01' })
  reviewDate: string;

  @ApiProperty({ format: 'uuid' })
  createdById: string;

  @ApiProperty({ format: 'date-time' })
  createdAt: string;

  // Cuándo se archivó, o null si está activo (spec 003, plan 1.6).
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  archivedAt: string | null;

  // Spec 005 (D6): la clave no está si quien pide no es ADMIN ni el responsable. Para los demás, la
  // respuesta es la misma de antes.
  @ApiPropertyOptional({
    type: DocumentReviewInfo,
    description: 'Solo para el ADMIN y el responsable del documento',
  })
  review?: DocumentReviewInfo;
}

// Respuesta del 201 de la carga y del detalle (R7, plan 3.1 y 3.3).
export class DocumentResponse extends DocumentFields {
  @ApiProperty({ type: DocumentVersionResponse })
  currentVersion: DocumentVersionResponse;
}

// Cada elemento del listado (plan 3.2).
export class DocumentSummary extends DocumentFields {
  @ApiProperty({ type: DocumentVersionSummary })
  currentVersion: DocumentVersionSummary;
}

// Spec 004 (plan 1.2): una parte del fragmento. Texto plano; `match` dice si es una palabra encontrada.
export class SearchFragmentPart {
  @ApiProperty({ example: 'caja' })
  text: string;

  @ApiProperty({ example: true })
  match: boolean;
}

// El fragmento del contenido donde aparece la búsqueda, recortado (R8). Sin HTML (R11).
export class SearchFragment {
  @ApiProperty({ type: [SearchFragmentPart] })
  parts: SearchFragmentPart[];

  @ApiProperty({ type: Number, nullable: true, example: 4 })
  pageNumber: number | null;
}

// Cada resultado de la búsqueda: lo mismo que el listado, más el fragmento, o null si la coincidencia
// es solo en el título o la descripción (R8).
export class DocumentSearchResult extends DocumentSummary {
  @ApiProperty({ type: SearchFragment, nullable: true })
  fragment: SearchFragment | null;
}

// Las columnas @db.Date llegan como medianoche UTC: se toma la fecha en UTC para no correr el día.
const toDateOnly = (date: Date) => date.toISOString().slice(0, 10);

// Campo por campo, nunca `...record`: un campo interno nuevo del repositorio no llega a la respuesta.
// La última revisión del registro solo sale dentro de `review`, y `review` solo si viene (spec 005, D6).
function toDocumentFields(
  record: DocumentRecord,
  review?: DocumentReviewInfo,
): Omit<DocumentResponse, 'currentVersion'> {
  return {
    id: record.id,
    title: record.title,
    description: record.description ?? null,
    status: record.status,
    areaIds: [...record.areaIds],
    ownerId: record.ownerId,
    reviewDate: toDateOnly(record.reviewDate),
    createdById: record.createdById,
    createdAt: record.createdAt.toISOString(),
    archivedAt: record.archivedAt ? record.archivedAt.toISOString() : null,
    ...(review && {
      review: {
        status: review.status,
        lastReviewedAt: review.lastReviewedAt,
        lastReviewedById: review.lastReviewedById,
      },
    }),
  };
}

function toVersionResponse(
  version: DocumentVersionRecord,
): DocumentVersionResponse {
  return {
    id: version.id,
    versionNumber: version.versionNumber,
    status: version.status,
    originalFileName: version.originalFileName,
    mimeType: version.mimeType,
    sizeBytes: version.sizeBytes,
    processingStatus: version.processingStatus,
    createdAt: version.createdAt.toISOString(),
  };
}

function toVersionSummary(
  version: DocumentVersionRecord,
): DocumentVersionSummary {
  return {
    id: version.id,
    versionNumber: version.versionNumber,
    originalFileName: version.originalFileName,
    mimeType: version.mimeType,
    processingStatus: version.processingStatus,
  };
}

export function toDocumentResponse(
  record: DocumentRecord,
  review?: DocumentReviewInfo,
): DocumentResponse {
  return {
    ...toDocumentFields(record, review),
    currentVersion: toVersionResponse(record.currentVersion),
  };
}

export function toVersionHistoryItem(
  version: VersionHistoryRecord,
): VersionHistoryItem {
  return {
    id: version.id,
    versionNumber: version.versionNumber,
    status: version.status,
    originalFileName: version.originalFileName,
    mimeType: version.mimeType,
    sizeBytes: version.sizeBytes,
    processingStatus: version.processingStatus,
    uploadedById: version.uploadedById,
    createdAt: version.createdAt.toISOString(),
  };
}

export function toDocumentSummary(
  record: DocumentRecord,
  review?: DocumentReviewInfo,
): DocumentSummary {
  return {
    ...toDocumentFields(record, review),
    currentVersion: toVersionSummary(record.currentVersion),
  };
}

// Spec 004: lo mismo que el listado, más el fragmento (o null).
export function toDocumentSearchResult(
  record: DocumentRecord,
  fragment: SearchFragment | null,
  review?: DocumentReviewInfo,
): DocumentSearchResult {
  return {
    ...toDocumentFields(record, review),
    currentVersion: toVersionSummary(record.currentVersion),
    fragment,
  };
}
