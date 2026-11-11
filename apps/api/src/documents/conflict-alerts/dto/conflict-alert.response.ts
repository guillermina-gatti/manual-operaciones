/* Forma de las respuestas de las alertas (spec 011, R14), mapeada campo por campo. No lleva quién hizo
la pregunta (D13) ni los IDs internos de los fragmentos y del mensaje */
import { ApiProperty } from '@nestjs/swagger';
import { DocumentReferenceResponse } from '../../dto/document.response';
import type { DocumentReference } from '../../document-references';
import type {
  ConflictAlertRecord,
  ConflictAlertSide,
} from '../conflict-alerts.repository';
import {
  CONFLICT_ALERT_STATUSES,
  type ConflictAlertStatus,
} from './list-conflict-alerts.query';

export const NO_SECTION = 'Sin sección';

export class ConflictAlertDocumentResponse {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'Manual de compras' })
  title: string;

  @ApiProperty({ enum: ['ACTIVE', 'ARCHIVED'] })
  status: 'ACTIVE' | 'ARCHIVED';

  @ApiProperty({
    example: 2,
    description: 'La versión de cuando se detectó la contradicción',
  })
  versionNumber: number;

  @ApiProperty({ example: 'Aprobaciones' })
  section: string;

  @ApiProperty({
    example: true,
    description: 'Si esa versión sigue siendo la vigente (R17)',
  })
  isCurrentVersion: boolean;
}

export class ConflictAlertResponse {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ enum: CONFLICT_ALERT_STATUSES })
  status: ConflictAlertStatus;

  @ApiProperty({
    type: [ConflictAlertDocumentResponse],
    minItems: 2,
    maxItems: 2,
    description: 'A (el de id menor) y B',
  })
  documents: [ConflictAlertDocumentResponse, ConflictAlertDocumentResponse];

  @ApiProperty({ example: '¿Quién aprueba una compra de $800.000?' })
  question: string;

  @ApiProperty({ format: 'date-time' })
  firstDetectedAt: string;

  @ApiProperty({ format: 'date-time' })
  lastDetectedAt: string;

  @ApiProperty({ example: 1 })
  occurrences: number;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  resolvedAt: string | null;

  @ApiProperty({ type: DocumentReferenceResponse, nullable: true })
  resolvedBy: DocumentReferenceResponse | null;

  @ApiProperty({ type: String, nullable: true })
  resolutionNote: string | null;
}

export class ConflictAlertListResponse {
  @ApiProperty({ type: [ConflictAlertResponse] })
  data: ConflictAlertResponse[];

  @ApiProperty({ example: 1, description: 'Las alertas del filtro pedido' })
  total: number;

  @ApiProperty({ example: 1, description: 'Las alertas abiertas' })
  openTotal: number;

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 20 })
  limit: number;
}

const toDocument = (
  side: ConflictAlertSide,
): ConflictAlertDocumentResponse => ({
  id: side.documentId,
  title: side.title,
  status: side.documentStatus,
  versionNumber: side.versionNumber,
  section: side.section ?? NO_SECTION,
  isCurrentVersion: side.isCurrentVersion,
});

// resolvedBy: la referencia de quien la resolvió, o null si está abierta.
export function toConflictAlertResponse(
  record: ConflictAlertRecord,
  resolvedBy: DocumentReference | null,
): ConflictAlertResponse {
  return {
    id: record.id,
    status: record.status,
    documents: [toDocument(record.a), toDocument(record.b)],
    question: record.question,
    firstDetectedAt: record.firstDetectedAt.toISOString(),
    lastDetectedAt: record.lastDetectedAt.toISOString(),
    occurrences: record.occurrences,
    resolvedAt: record.resolvedAt?.toISOString() ?? null,
    resolvedBy: resolvedBy
      ? {
          id: resolvedBy.id,
          name: resolvedBy.name,
          isActive: resolvedBy.isActive,
        }
      : null,
    resolutionNote: record.resolutionNote,
  };
}
