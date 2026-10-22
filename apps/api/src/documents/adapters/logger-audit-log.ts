import { Injectable, Logger } from '@nestjs/common';
import { AuditEntry, AuditLog } from '../ports/audit-log';

// Simulación hasta que se resuelva A1: escribe la auditoría en el log de Nest (plan 5.4).
@Injectable()
export class LoggerAuditLog extends AuditLog {
  private readonly logger = new Logger('AuditLog');

  // El log no se puede deshacer con un rollback, así que la transacción se ignora.
  record(entry: AuditEntry, _tx?: unknown): Promise<void> {
    // Campo por campo, nunca `...entry`: lo que no esté en esta lista no llega al log.
    this.logger.log({
      action: entry.action,
      actorId: entry.actorId,
      ...(entry.documentId && { documentId: entry.documentId }),
      result: entry.result,
      ...(entry.detail && { detail: entry.detail }),
      at: entry.at.toISOString(),
    });
    return Promise.resolve();
  }
}
