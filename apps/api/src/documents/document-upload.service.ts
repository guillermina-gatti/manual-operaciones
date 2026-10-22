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

// Cuenta caracteres, no unidades UTF-16: no parte un emoji ni una letra con tilde compuesta.
const truncate = (text: string, maxLength: number) =>
  Array.from(text).slice(0, maxLength).join('');

// Orquesta la carga en el orden del plan 4: valida sin escribir nada (3b a 3f) y después escribe todo o nada (4 a 7).
@Injectable()
export class DocumentUploadService {
  private readonly logger = new Logger(DocumentUploadService.name);

  // Se crea al construir el servicio: una APP_TIMEZONE inválida falla al arrancar (D1).
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
    private readonly queue: ProcessingQueue,
    private readonly audit: AuditLog,
  ) {}

  async upload(
    file: UploadedFileInput | undefined,
    dto: CreateDocumentDto,
    actor: AuthUser,
  ): Promise<DocumentResponse> {
    try {
      const inspected = await this.validateBeforeWriting(file, dto);
      // inspectFile ya rechazó un archivo ausente.
      const uploaded = file as UploadedFileInput;
      const record = await this.write(uploaded, inspected, dto, actor);
      return toDocumentResponse(record);
    } catch (error) {
      const failure = toHttpException(error, this.logger, 'carga');
      // Fuera de la transacción y después del rollback y del delete (plan 4, R14).
      await this.auditFailure(actor, failure.getStatus());
      throw failure;
    }
  }

  // Pasos 4 a 6: todo o nada (R7, R8).
  private async write(
    file: UploadedFileInput,
    inspected: InspectedFile,
    dto: CreateDocumentDto,
    actor: AuthUser,
  ): Promise<DocumentRecord> {
    // 4: ids y clave los genera el sistema; el nombre original no se usa en la ruta (R9).
    const documentId = randomUUID();
    const versionId = randomUUID();
    const key = `documents/${documentId}/${versionId}.${inspected.extension}`;
    await this.storage.put(
      key,
      file.buffer,
      inspected.mimeType,
      inspected.checksum,
    );

    let committed = false;
    try {
      // 5: si cualquier paso lanza, runInTransaction hace rollback.
      const record = await this.documents.runInTransaction(async (tx) => {
        const created = await this.documents.createWithFirstVersion(tx, {
          id: documentId,
          title: dto.title,
          description: dto.description ?? null,
          areaIds: dto.areaIds,
          ownerId: dto.ownerId,
          // Medianoche UTC, como Prisma representa las columnas @db.Date.
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
        }); // 5a
        await this.audit.record(
          {
            action: 'DOCUMENT_UPLOAD',
            actorId: actor.id,
            documentId,
            result: 'SUCCESS',
            at: new Date(),
          },
          tx,
        ); // 5b: se deshace con la transacción
        // 5c: lo último, porque un aviso enviado no se puede retirar.
        await this.queue.enqueue(versionId);
        return created;
      }); // 6: commit
      committed = true;
      return record;
    } finally {
      // Cualquier error entre el put y el commit deja un archivo sin documento: se borra.
      if (!committed) await this.deleteUploadedFile(key, documentId);
    }
  }

  private async deleteUploadedFile(
    key: string,
    documentId: string,
  ): Promise<void> {
    try {
      await this.storage.delete(key);
    } catch (error) {
      // Único residuo posible: un objeto que nadie puede ver ni descargar. Se limpia a mano.
      this.logger.error({
        message: 'No se pudo borrar el archivo de una carga fallida',
        key,
        documentId,
        cause: errorMessage(error),
      });
    }
  }

  // Mejor esfuerzo: si la auditoría del fallo también falla, se responde con el error original.
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

  private async validateBeforeWriting(
    file: UploadedFileInput | undefined,
    dto: CreateDocumentDto,
  ): Promise<InspectedFile> {
    const inspected = inspectFile(file); // 3b: 400 o 415 (R2, R3)
    this.assertReviewDateIsAfterToday(dto.reviewDate); // 3c (R6, D1)
    await this.assertAreasExist(dto.areaIds); // 3d (R5)
    await this.assertOwnerCanSeeDocument(dto.ownerId, dto.areaIds); // 3e (R5)
    await this.assertNotDuplicated(inspected.checksum); // 3f (R8b)
    return inspected;
  }

  // R6: posterior a la fecha de carga, por día y en la zona horaria de la empresa.
  // Las dos fechas son YYYY-MM-DD, así que alcanza con comparar los textos.
  private assertReviewDateIsAfterToday(reviewDate: string): void {
    const today = this.today();
    if (reviewDate <= today) {
      throw new BadRequestException(
        `reviewDate tiene que ser posterior a hoy (${today})`,
      );
    }
  }

  private today(): string {
    const parts = Object.fromEntries(
      this.todayFormat
        .formatToParts(new Date())
        .map((part) => [part.type, part.value]),
    );
    return `${parts.year}-${parts.month}-${parts.day}`;
  }

  private async assertAreasExist(areaIds: string[]): Promise<void> {
    const existing = new Set(await this.areas.findExistingIds(areaIds));
    const missing = areaIds.filter((id) => !existing.has(id));
    if (missing.length > 0) {
      throw new BadRequestException(
        `areaIds: no existen las áreas ${missing.join(', ')}`,
      );
    }
  }

  // El responsable puede tener cualquier rol, pero tiene que poder ver el documento.
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
