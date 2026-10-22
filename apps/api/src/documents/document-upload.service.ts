import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { AuthUser } from '../common/auth';
import { FileStorage } from '../storage/file-storage';
import { canBeOwner } from './document-access.policy';
import { DocumentRecord, DocumentsRepository } from './documents.repository';
import { CreateDocumentDto } from './dto/create-document.dto';
import { DocumentResponse, toDocumentResponse } from './dto/document.response';
import {
  InspectedFile,
  UploadedFileInput,
  inspectFile,
} from './file-inspector';
import { errorMessage, toHttpException } from './http-errors';
import { AreasDirectory } from './ports/areas-directory';
import { AuditLog } from './ports/audit-log';
import { ProcessingQueue } from './ports/processing-queue';
import { UsersDirectory } from './ports/users-directory';

const DEFAULT_TIME_ZONE = 'America/Argentina/Buenos_Aires';
const MAX_ORIGINAL_FILE_NAME_LENGTH = 255;

// Recorta nombres largos de archivos sin romper caracteres especiales (como emojis o tildes)
const truncate = (text: string, maxLength: number) =>
  Array.from(text).slice(0, maxLength).join('');

// Servicio que orquesta todo el flujo de subida de documentos
@Injectable()
export class DocumentUploadService {
  private readonly logger = new Logger(DocumentUploadService.name);

  // Formateador de fecha configurado con la zona horaria del sistema
  private readonly todayFormat = new Intl.DateTimeFormat('en-US', {
    timeZone: process.env.APP_TIMEZONE || DEFAULT_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  // Inyección de todas las dependencias necesarias (puertos y repositorios)
  constructor(
    private readonly areas: AreasDirectory,
    private readonly users: UsersDirectory,
    private readonly documents: DocumentsRepository,
    private readonly storage: FileStorage,
    private readonly queue: ProcessingQueue,
    private readonly audit: AuditLog,
  ) {}

  // Método principal que ejecuta el proceso completo de carga
  async upload(
    file: UploadedFileInput | undefined,
    dto: CreateDocumentDto,
    actor: AuthUser,
  ): Promise<DocumentResponse> {
    try {
      // 1. Valida todo primero sin guardar nada
      const inspected = await this.validateBeforeWriting(file, dto);
      const uploaded = file as UploadedFileInput;

      // 2. Procede a escribir en almacenamiento y base de datos
      const record = await this.write(uploaded, inspected, dto, actor);

      // 3. Devuelve la respuesta formateada
      return toDocumentResponse(record);
    } catch (error) {
      const failure = toHttpException(error, this.logger, 'carga');
      // Registra el fallo en la auditoría si la carga fracasó
      await this.auditFailure(actor, failure.getStatus());
      throw failure;
    }
  }

  // Realiza los pasos de escritura garantizando "todo o nada"
  private async write(
    file: UploadedFileInput,
    inspected: InspectedFile,
    dto: CreateDocumentDto,
    actor: AuthUser,
  ): Promise<DocumentRecord> {
    // Genera identificadores únicos y la ruta dentro del almacenamiento
    const documentId = randomUUID();
    const versionId = randomUUID();
    const key = `documents/${documentId}/${versionId}.${inspected.extension}`;

    // Sube el archivo binario a S3 o memoria
    await this.storage.put(
      key,
      file.buffer,
      inspected.mimeType,
      inspected.checksum,
    );

    let committed = false;
    try {
      // Abre transacción en la base de datos: si algo falla adentro, todo se revierte
      const record = await this.documents.runInTransaction(async (tx) => {
        // Guarda el documento y su primera versión
        const created = await this.documents.createWithFirstVersion(tx, {
          id: documentId,
          title: dto.title,
          description: dto.description ?? null,
          areaIds: dto.areaIds,
          ownerId: dto.ownerId,
          reviewDate: new Date(`${dto.reviewDate}T00:00:00.000Z`),
          createdById: actor.id,
          version: {
            id: versionId,
            storageKey: key,
            originalFileName: truncate(
              file.originalname,
              MAX_ORIGINAL_FILE_NAME_LENGTH,
            ),
            mimeType: inspected.mimeType,
            sizeBytes: inspected.sizeBytes,
            checksum: inspected.checksum,
            uploadedById: actor.id,
          },
        });

        // Registra el éxito en la auditoría (dentro de la misma transacción)
        await this.audit.record(
          {
            action: 'DOCUMENT_UPLOAD',
            actorId: actor.id,
            documentId,
            result: 'SUCCESS',
            at: new Date(),
          },
          tx,
        );

        // Envía el evento a la cola de procesamiento en segundo plano
        await this.queue.enqueue(versionId);
        return created;
      });

      committed = true; // Confirmado con éxito
      return record;
    } finally {
      // Si la transacción falló antes de confirmarse, elimina el archivo del almacenamiento para no dejar basura
      if (!committed) await this.deleteUploadedFile(key, documentId);
    }
  }

  // Método auxiliar para eliminar archivos en caso de rollback
  private async deleteUploadedFile(
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

  // Registra el intento fallido en la auditoría (mejor esfuerzo)
  private async auditFailure(actor: AuthUser, status: number): Promise<void> {
    try {
      await this.audit.record({
        action: 'DOCUMENT_UPLOAD',
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

  // Agrupa todas las validaciones previas antes de tocar la base de datos o almacenamiento
  private async validateBeforeWriting(
    file: UploadedFileInput | undefined,
    dto: CreateDocumentDto,
  ): Promise<InspectedFile> {
    const inspected = inspectFile(file); // Valida formato y contenido binario
    this.assertReviewDateIsAfterToday(dto.reviewDate); // Valida fecha
    await this.assertAreasExist(dto.areaIds); // Valida que las áreas existan
    await this.assertOwnerCanSeeDocument(dto.ownerId, dto.areaIds); // Valida que el responsable pertenezca al área
    await this.assertNotDuplicated(inspected.checksum); // Valida que no esté repetido
    return inspected;
  }

  // Comprueba que la fecha de revisión no sea hoy ni una fecha pasada
  private assertReviewDateIsAfterToday(reviewDate: string): void {
    const today = this.today();
    if (reviewDate <= today) {
      throw new BadRequestException(
        `reviewDate tiene que ser posterior a hoy (${today})`,
      );
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

  // Valida que las áreas indicadas existan en el sistema
  private async assertAreasExist(areaIds: string[]): Promise<void> {
    const existing = new Set(await this.areas.findExistingIds(areaIds));
    const missing = areaIds.filter((id) => !existing.has(id));
    if (missing.length > 0) {
      throw new BadRequestException(
        `areaIds: no existen las áreas ${missing.join(', ')}`,
      );
    }
  }

  // Valida que el responsable exista y tenga acceso a las áreas del documento
  private async assertOwnerCanSeeDocument(
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
  private async assertNotDuplicated(checksum: string): Promise<void> {
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
}
