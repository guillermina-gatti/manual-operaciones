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
import type { ReferenceLookup } from '../document-references';
import type {
  DocumentReviewInfo as ReviewInfo,
  ReviewStatus,
} from '../review-status';

// Spec 008 (R1, R3, R12): una persona o un área, con su nombre y su estado actuales. Solo estos tres
// campos: nada más del directorio (rol, áreas) llega a la respuesta.
export class DocumentReferenceResponse {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'Ana Pérez',
    description: 'null si el directorio no la encontró (R12)',
  })
  name: string | null;

  @ApiProperty({ example: true })
  isActive: boolean;
}

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

  // Cuándo se subió la versión vigente: la web lo muestra como "actualizado hace X".
  @ApiProperty({ format: 'date-time' })
  createdAt: string;
}

// Una fila del historial (spec 003, plan 1.4): la versión y quién la subió.
export class VersionHistoryItem extends DocumentVersionResponse {
  @ApiProperty({ format: 'uuid' })
  uploadedById: string;

  // Spec 008 (P3): quién la subió, con nombre y estado. uploadedById sigue (P1).
  @ApiProperty({ type: DocumentReferenceResponse })
  uploadedBy: DocumentReferenceResponse;
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

  // Spec 008 (P2): quien hizo la última revisión, con nombre y estado; null si nunca se revisó.
  @ApiProperty({ type: DocumentReferenceResponse, nullable: true })
  lastReviewedBy: DocumentReferenceResponse | null;
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

  // Spec 008 (R1, P1): las mismas áreas, en el orden de areaIds, con nombre y estado.
  @ApiProperty({ type: [DocumentReferenceResponse] })
  areas: DocumentReferenceResponse[];

  @ApiProperty({ format: 'uuid' })
  ownerId: string;

  // Spec 008 (R1, P1): el responsable, con nombre y estado.
  @ApiProperty({ type: DocumentReferenceResponse })
  owner: DocumentReferenceResponse;

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
// Spec 008 (PD2): refs es obligatorio, así ninguna respuesta sale sin nombres por olvido.
function toDocumentFields(
  record: DocumentRecord,
  refs: ReferenceLookup,
  review?: ReviewInfo,
): Omit<DocumentResponse, 'currentVersion'> {
  return {
    id: record.id,
    title: record.title,
    description: record.description ?? null,
    status: record.status,
    areaIds: [...record.areaIds],
    areas: record.areaIds.map((id) => refs.area(id)),
    ownerId: record.ownerId,
    owner: refs.user(record.ownerId),
    reviewDate: toDateOnly(record.reviewDate),
    createdById: record.createdById,
    createdAt: record.createdAt.toISOString(),
    archivedAt: record.archivedAt ? record.archivedAt.toISOString() : null,
    ...(review && {
      review: {
        status: review.status,
        lastReviewedAt: review.lastReviewedAt,
        lastReviewedById: review.lastReviewedById,
        lastReviewedBy: review.lastReviewedById
          ? refs.user(review.lastReviewedById)
          : null,
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
    createdAt: version.createdAt.toISOString(),
  };
}

export function toDocumentResponse(
  record: DocumentRecord,
  refs: ReferenceLookup,
  review?: ReviewInfo,
): DocumentResponse {
  return {
    ...toDocumentFields(record, refs, review),
    currentVersion: toVersionResponse(record.currentVersion),
  };
}

export function toVersionHistoryItem(
  version: VersionHistoryRecord,
  refs: ReferenceLookup,
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
    uploadedBy: refs.user(version.uploadedById),
    createdAt: version.createdAt.toISOString(),
  };
}

export function toDocumentSummary(
  record: DocumentRecord,
  refs: ReferenceLookup,
  review?: ReviewInfo,
): DocumentSummary {
  return {
    ...toDocumentFields(record, refs, review),
    currentVersion: toVersionSummary(record.currentVersion),
  };
}

// Spec 004: lo mismo que el listado, más el fragmento (o null).
export function toDocumentSearchResult(
  record: DocumentRecord,
  fragment: SearchFragment | null,
  refs: ReferenceLookup,
  review?: ReviewInfo,
): DocumentSearchResult {
  return {
    ...toDocumentFields(record, refs, review),
    currentVersion: toVersionSummary(record.currentVersion),
    fragment,
  };
}
