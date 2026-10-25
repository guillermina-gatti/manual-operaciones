//Define la estructura exacta de cómo se le responderá al cliente una vez que el documento es
// consultado o creado con éxito.
import { ApiProperty } from '@nestjs/swagger';
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
function toDocumentFields(
  record: DocumentRecord,
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

export function toDocumentResponse(record: DocumentRecord): DocumentResponse {
  return {
    ...toDocumentFields(record),
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

export function toDocumentSummary(record: DocumentRecord): DocumentSummary {
  return {
    ...toDocumentFields(record),
    currentVersion: toVersionSummary(record.currentVersion),
  };
}

// Spec 004: lo mismo que el listado, más el fragmento (o null).
export function toDocumentSearchResult(
  record: DocumentRecord,
  fragment: SearchFragment | null,
): DocumentSearchResult {
  return {
    ...toDocumentFields(record),
    currentVersion: toVersionSummary(record.currentVersion),
    fragment,
  };
}
