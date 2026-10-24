// DOCUMENT_UPLOAD: carga (spec 001, R14). Las otras tres: ciclo de vida (spec 003, R13).
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

// Puerto (plan 5.4): el dueño real de la auditoría está abierto (A1).
// `tx` es la transacción de la carga, opaca para los servicios (plan 5.6).
export abstract class AuditLog {
  abstract record(entry: AuditEntry, tx?: unknown): Promise<void>;
}
