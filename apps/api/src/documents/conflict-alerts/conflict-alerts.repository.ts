/* Puerto de las alertas de documentos contradictorios (spec 011, R14, R15; plan 011, 2.7). Las crea
el chat (ConflictAlertRecorder); este puerto solo las lista y las resuelve */
import type { ConflictAlertStatus } from './dto/list-conflict-alerts.query';

// Uno de los dos documentos de la alerta, con la versión de cuando se detectó.
export interface ConflictAlertSide {
  documentId: string;
  title: string; // el título actual
  documentStatus: 'ACTIVE' | 'ARCHIVED';
  versionNumber: number;
  isCurrentVersion: boolean; // si esa versión sigue siendo la vigente (R17)
  section: string | null; // null sin sección, o si el fragmento ya no existe
}

export interface ConflictAlertRecord {
  id: string;
  status: ConflictAlertStatus;
  a: ConflictAlertSide; // el documento de id menor (R11)
  b: ConflictAlertSide;
  question: string;
  firstDetectedAt: Date;
  lastDetectedAt: Date;
  occurrences: number;
  resolvedAt: Date | null;
  resolvedById: string | null;
  resolutionNote: string | null;
}

export interface ListConflictAlertsFilter {
  status: ConflictAlertStatus;
  page: number;
  limit: number;
}

export interface ConflictAlertPage {
  items: ConflictAlertRecord[];
  total: number; // las del filtro pedido
  openTotal: number; // las abiertas, para el acceso "Alertas (n)" (F5)
}

export abstract class ConflictAlertsRepository {
  abstract list(filter: ListConflictAlertsFilter): Promise<ConflictAlertPage>;
  abstract findById(id: string): Promise<ConflictAlertRecord | null>;
  // R15: solo si está abierta. false si no cambió nada (no existe o ya estaba resuelta).
  abstract resolve(
    id: string,
    resolvedById: string,
    note: string | null,
    at: Date,
  ): Promise<boolean>;
}
