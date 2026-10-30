// Puerto y estructuras de datos para el registro de auditoría de acciones del sistema.
export type AuditAction =
  | 'DOCUMENT_UPLOAD'
  | 'DOCUMENT_AREAS_CHANGE'
  | 'DOCUMENT_VERSION_UPLOAD'
  | 'DOCUMENT_ARCHIVE'
  | 'DOCUMENT_REVIEW'; // "Marcar como revisado" (spec 005, R12)
export type AuditResult = 'SUCCESS' | 'FAILURE';

// Quién, qué documento, cuándo y con qué resultado (R14). Solo ids: nunca el contenido del archivo,
// tokens ni credenciales.
export interface AuditEntry {
  action: AuditAction;
  actorId: string;
  documentId?: string;
  result: AuditResult;
  // Motivo de un fallo: el código HTTP (plan 4).
  detail?: string;
  // "Marcar como revisado" (spec 005, R12): la fecha que tenía y la elegida, como YYYY-MM-DD.
  previousReviewDate?: string;
  newReviewDate?: string;
  at: Date;
}

// Las fechas de una revisión, para auditar también los fallos (spec 005, R12).
export type ReviewAuditDates = Pick<
  AuditEntry,
  'previousReviewDate' | 'newReviewDate'
>;

// Puerto abstractor para registrar las entradas de auditoría, soportando transacciones opacas.
export abstract class AuditLog {
  abstract record(entry: AuditEntry, tx?: unknown): Promise<void>;
}
