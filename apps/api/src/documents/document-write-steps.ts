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
import { FileStorage } from '../storage/file-storage';
import { canBeOwner } from './document-access.policy';
import { DocumentsRepository } from './documents.repository';
import { errorMessage } from './http-errors';
import { AreasDirectory } from './ports/areas-directory';
import { AuditLog } from './ports/audit-log';
import type { AuditAction } from './ports/audit-log';
import { UsersDirectory } from './ports/users-directory';

const DEFAULT_TIME_ZONE = 'America/Argentina/Buenos_Aires';
export const MAX_ORIGINAL_FILE_NAME_LENGTH = 255;

// Recorta nombres largos de archivos sin romper caracteres especiales (como emojis o tildes)
export const truncateFileName = (text: string) =>
  Array.from(text).slice(0, MAX_ORIGINAL_FILE_NAME_LENGTH).join('');

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

  // Formateador de fecha configurado con la zona horaria del sistema
  private readonly todayFormat = new Intl.DateTimeFormat('en-US', {
    timeZone: process.env.APP_TIMEZONE || DEFAULT_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  constructor(
    private readonly areas: AreasDirectory,
    private readonly users: UsersDirectory,
    private readonly documents: DocumentsRepository,
    private readonly storage: FileStorage,
    private readonly audit: AuditLog,
  ) {}

  // Comprueba que la fecha de revisión no sea hoy ni una fecha pasada
  assertReviewDateIsAfterToday(reviewDate: string): void {
    const today = this.today();
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

  // Valida que no exista otro documento activo con el mismo contenido (checksum)
  async assertNotDuplicated(checksum: string): Promise<void> {
    const duplicate = await this.documents.findActiveByChecksum(checksum);
    if (duplicate) {
      throw new ConflictException({
        statusCode: 409,
        message: 'Ya hay un documento vigente con el mismo archivo',
        error: 'Conflict',
        existingDocumentId: duplicate.documentId,
      });
    }
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

  // Registra el intento fallido en la auditoría (mejor esfuerzo)
  async auditFailure(
    action: AuditAction,
    actor: AuthUser,
    status: number,
  ): Promise<void> {
    try {
      await this.audit.record({
        action,
        actorId: actor.id,
        result: 'FAILURE',
        detail: String(status),
        at: new Date(),
      });
    } catch (error) {
      this.logger.error({
        message: 'No se pudo auditar una carga fallida',
        actorId: actor.id,
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

  // Obtiene la fecha actual formateada en YYYY-MM-DD
  private today(): string {
    const parts = Object.fromEntries(
      this.todayFormat
        .formatToParts(new Date())
        .map((part) => [part.type, part.value]),
    );
    return `${parts.year}-${parts.month}-${parts.day}`;
  }
}
