// Respuesta de GET /metrics/documents (spec 007, R8) para Swagger y el mapeo campo por campo desde
// la vista del servicio. Los nombres de las clases son propios para no chocar en Swagger con los de
// las métricas de procedimientos (D4).
import { ApiProperty } from '@nestjs/swagger';
import type { DocumentMetricsView } from '../document-metrics.service';

export class DocumentMetricsFiltersResponse {
  @ApiProperty({ format: 'uuid', type: String, nullable: true })
  areaId: string | null;

  @ApiProperty({ example: '2026-10-01', type: String, nullable: true })
  from: string | null;

  @ApiProperty({ example: '2026-10-31', type: String, nullable: true })
  to: string | null;
}

export class DocumentMetricsTotalsResponse {
  @ApiProperty({
    example: 12,
    description:
      'Documentos activos del alcance, hoy. upToDate + dueSoon + overdue',
  })
  active: number;

  @ApiProperty({
    example: 8,
    description: 'Activos con la fecha de revisión después de hoy + 30 días',
  })
  upToDate: number;

  @ApiProperty({
    example: 3,
    description: 'Activos con la fecha de revisión entre hoy y hoy + 30 días',
  })
  dueSoon: number;

  @ApiProperty({
    example: 1,
    description: 'Activos con la fecha de revisión anterior a hoy',
  })
  overdue: number;

  @ApiProperty({
    example: 0,
    description: 'Activos cuya versión vigente tiene el procesamiento en error',
  })
  processingFailed: number;

  @ApiProperty({
    example: 4,
    description:
      'Activos cargados entre from y to (inclusive, en hora de la empresa). Sin fechas, todos',
  })
  uploaded: number;
}

export class DocumentMetricsResponse {
  @ApiProperty({ type: DocumentMetricsFiltersResponse })
  filters: DocumentMetricsFiltersResponse;

  @ApiProperty({ type: DocumentMetricsTotalsResponse })
  totals: DocumentMetricsTotalsResponse;
}

export const toDocumentMetricsResponse = (
  view: DocumentMetricsView,
): DocumentMetricsResponse => ({
  filters: {
    areaId: view.filters.areaId,
    from: view.filters.from,
    to: view.filters.to,
  },
  totals: {
    active: view.totals.active,
    upToDate: view.totals.upToDate,
    dueSoon: view.totals.dueSoon,
    overdue: view.totals.overdue,
    processingFailed: view.totals.processingFailed,
    uploaded: view.totals.uploaded,
  },
});
