/* Pasos de escritura que comparten la carga (spec 001) y el ciclo de vida (spec 003):
validaciones previas, guardar el archivo con compensación y auditar los fallos.
Movidos tal cual desde DocumentUploadService (plan 003, sección 4; T02). */

import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import type { AuthUser } from '../common/auth';
import { Clock, SystemClock } from '../common/clock';
import { FileStorage } from '../storage/file-storage';
import { todayInCompany } from './company-date';
import { canBeOwner } from './document-access.policy';
import { DocumentsRepository } from './documents.repository';
import { errorMessage } from './http-errors';
import { AreasDirectory } from './ports/areas-directory';
import { AuditLog } from './ports/audit-log';
import type { AuditAction, ReviewAuditDates } from './ports/audit-log';
import { UsersDirectory } from './ports/users-directory';

export const MAX_ORIGINAL_FILE_NAME_LENGTH = 255;

// Recorta nombres largos de archivos sin romper caracteres especiales (como emojis o tildes)
export const truncateFileName = (text: string) =>
  Array.from(text).slice(0, MAX_ORIGINAL_FILE_NAME_LENGTH).join('');

// El 409 de un archivo igual a la versión vigente de otro documento activo (R8b de la spec 001).
// Lo usan la carga y la versión nueva (spec 003).
export const duplicateDocumentConflict = (existingDocumentId: string) =>
  new ConflictException({
    statusCode: 409,
    message: 'Ya hay un documento vigente con el mismo archivo',
    error: 'Conflict',
    reason: 'DUPLICATE',
    existingDocumentId,
  });

// El archivo que se guarda antes de confirmar la transacción.
export interface FileToStore {
  key: string;
  documentId: string;
  buffer: Buffer;
  mimeType: string;
  checksum: string;
}

@Injectable()
export class DocumentWriteSteps {
  private readonly logger = new Logger(DocumentWriteSteps.name);

  // El reloj es el último parámetro y tiene valor por defecto: quien no lo pasa usa la hora real
  // (spec 005, D2).
  constructor(
    private readonly areas: AreasDirectory,
    private readonly users: UsersDirectory,
    private readonly documents: DocumentsRepository,
    private readonly storage: FileStorage,
    private readonly audit: AuditLog,
    private readonly clock: Clock = new SystemClock(),
  ) {}

  // Comprueba que la fecha de revisión no sea hoy ni una fecha pasada, en hora de la empresa
  assertReviewDateIsAfterToday(reviewDate: string): void {
    const today = todayInCompany(this.clock.now());
    if (reviewDate <= today) {
      throw new BadRequestException(
        `reviewDate tiene que ser posterior a hoy (${today})`,
      );
    }
  }

  // Valida que las áreas indicadas existan en el sistema
  async assertAreasExist(areaIds: string[]): Promise<void> {
    const existing = new Set(await this.areas.findExistingIds(areaIds));
    const missing = areaIds.filter((id) => !existing.has(id));
    if (missing.length > 0) {
      throw new BadRequestException(
        `areaIds: no existen las áreas ${missing.join(', ')}`,
      );
    }
  }

  // Valida que el responsable exista y tenga acceso a las áreas del documento
  async assertOwnerCanSeeDocument(
    ownerId: string,
    areaIds: string[],
  ): Promise<void> {
    const owner = await this.users.findById(ownerId);
    if (!owner) {
      throw new BadRequestException('ownerId: el responsable no existe');
    }
    if (!canBeOwner(owner, areaIds)) {
      throw new BadRequestException(
        'ownerId: el responsable no comparte ningún área con el documento',
      );
    }
  }

  // Valida que no exista otro documento activo con el mismo contenido (checksum).
  // `reason` le dice a la web qué tipo de 409 es (plan 003, D7); existingDocumentId sigue igual.
  async assertNotDuplicated(checksum: string): Promise<void> {
    const duplicate = await this.documents.findActiveByChecksum(checksum);
    if (duplicate) throw duplicateDocumentConflict(duplicate.documentId);
  }

  // Guarda el archivo y después ejecuta commit (la transacción). Si commit no termina bien,
  // borra el archivo guardado para no dejar basura y relanza el error de commit.
  async storeThenCommit<T>(
    file: FileToStore,
    commit: () => Promise<T>,
  ): Promise<T> {
    // Sube el archivo binario a S3 o memoria
    await this.storage.put(file.key, file.buffer, file.mimeType, file.checksum);

    let committed = false;
    try {
      const result = await commit();
      committed = true; // Confirmado con éxito
      return result;
    } finally {
      // Si la transacción falló antes de confirmarse, elimina el archivo del almacenamiento
      if (!committed) await this.deleteStoredFile(file.key, file.documentId);
    }
  }

  // Registra el intento fallido en la auditoría (mejor esfuerzo). Las acciones sobre un documento
  // existente (spec 003, R13) pasan su documentId; la carga no lo tiene todavía. "Marcar como
  // revisado" pasa además las fechas que conoce (spec 005, R12).
  async auditFailure(
    action: AuditAction,
    actor: AuthUser,
    status: number,
    documentId?: string,
    extra?: ReviewAuditDates,
  ): Promise<void> {
    try {
      await this.audit.record({
        action,
        actorId: actor.id,
        ...(documentId && { documentId }),
        result: 'FAILURE',
        detail: String(status),
        ...(extra?.previousReviewDate && {
          previousReviewDate: extra.previousReviewDate,
        }),
        ...(extra?.newReviewDate && { newReviewDate: extra.newReviewDate }),
        at: new Date(),
      });
    } catch (error) {
      this.logger.error({
        message: 'No se pudo auditar una carga fallida',
        actorId: actor.id,
        documentId,
        status,
        cause: errorMessage(error),
      });
    }
  }

  // Elimina el archivo de una escritura que no se confirmó
  private async deleteStoredFile(
    key: string,
    documentId: string,
  ): Promise<void> {
    try {
      await this.storage.delete(key);
    } catch (error) {
      this.logger.error({
        message: 'No se pudo borrar el archivo de una carga fallida',
        key,
        documentId,
        cause: errorMessage(error),
      });
    }
  }
}
