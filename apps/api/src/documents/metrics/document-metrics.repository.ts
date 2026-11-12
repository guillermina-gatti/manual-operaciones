/* Cómo el servicio de métricas lee los totales de documentos, sin depender de Prisma (spec 007, D5).
Una base que no responde lanza RepositoryUnavailableError, que la API convierte en 503 */

export interface DocumentMetricsQuery {
  areaIds: string[] | null; // null: todas las áreas (documentMetricsAreaIds)
  today: string; // YYYY-MM-DD en hora de la empresa
  dueSoonThrough: string; // YYYY-MM-DD: el último día "por vencer" (dueSoonThrough(today))
  uploadedFrom: Date | null; // [from, to) de toMetricsPeriod; null: sin límite de ese lado
  uploadedTo: Date | null;
}

// R5 y R6: upToDate + dueSoon + overdue = active.
export interface DocumentMetricsTotals {
  active: number;
  upToDate: number;
  dueSoon: number;
  overdue: number;
  processingFailed: number;
  uploaded: number;
}

export abstract class DocumentMetricsRepository {
  abstract totals(query: DocumentMetricsQuery): Promise<DocumentMetricsTotals>;
}
