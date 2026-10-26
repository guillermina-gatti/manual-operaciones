// Puerto y estructuras de datos para el registro de auditoría de acciones del sistema.
export type AuditAction =
  | 'DOCUMENT_UPLOAD'
  | 'DOCUMENT_AREAS_CHANGE'
  | 'DOCUMENT_VERSION_UPLOAD'
  | 'DOCUMENT_ARCHIVE';
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
  at: Date;
}

// Puerto abstractor para registrar las entradas de auditoría, soportando transacciones opacas.
export abstract class AuditLog {
  abstract record(entry: AuditEntry, tx?: unknown): Promise<void>;
}
