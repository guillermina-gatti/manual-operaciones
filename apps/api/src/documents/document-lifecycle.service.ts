/* Ciclo de vida de un documento que ya existe (spec 003): cambiar sus áreas, subir una versión
nueva y archivarlo. Usa los mismos pasos de escritura que la carga (DocumentWriteSteps). */

import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { AuthUser } from '../common/auth';
import { FileStorage } from '../storage/file-storage';
import {
  DocumentWriteSteps,
  duplicateDocumentConflict,
  truncateFileName,
} from './document-write-steps';
import {
  ConcurrentVersionError,
  DocumentRecord,
  DocumentsRepository,
  RepositoryTransaction,
} from './documents.repository';
import { ChangeAreasDto } from './dto/change-areas.dto';
import { CreateVersionDto } from './dto/create-version.dto';
import { DocumentResponse, toDocumentResponse } from './dto/document.response';
import { UploadedFileInput, inspectFile } from './file-inspector';
import { HttpOperation, toHttpException } from './http-errors';
import { AreasDirectory } from './ports/areas-directory';
import { AuditAction, AuditLog } from './ports/audit-log';
import { ProcessingQueue } from './ports/processing-queue';
import { UsersDirectory } from './ports/users-directory';

// R2: el mismo texto que la consulta (spec 001, R11).
const documentNotFound = () =>
  new NotFoundException('No se encontró el documento');

// R11: un documento archivado no se modifica. `reason` le dice a la web qué 409 es (D7).
const documentArchived = () =>
  new ConflictException({
    statusCode: 409,
    message: 'El documento está archivado',
    error: 'Conflict',
    reason: 'ARCHIVED',
  });

// R6b: subir otra vez el archivo de la versión vigente no crea una versión.
const identicalToCurrent = () =>
  new ConflictException({
    statusCode: 409,
    message: 'El archivo es igual a la versión vigente',
    error: 'Conflict',
    reason: 'IDENTICAL_TO_CURRENT',
  });

// R8: la base rechazó una segunda CURRENT. Solo pasa si alguien escribió sin el bloqueo (plan 003, 5).
const concurrentVersion = () =>
  new ConflictException({
    statusCode: 409,
    message: 'Otra versión nueva se cargó al mismo tiempo. Probá de nuevo.',
    error: 'Conflict',
    reason: 'CONCURRENT_VERSION',
  });

const sameAreas = (current: string[], next: string[]) =>
  current.length === next.length && next.every((id) => current.includes(id));

@Injectable()
export class DocumentLifecycleService {
  private readonly logger = new Logger(DocumentLifecycleService.name);
  private readonly steps: DocumentWriteSteps;

  // Los mismos puertos que la carga, para armar los pasos compartidos igual que ella.
  constructor(
    areas: AreasDirectory,
    users: UsersDirectory,
    private readonly documents: DocumentsRepository,
    storage: FileStorage,
    private readonly queue: ProcessingQueue,
    private readonly audit: AuditLog,
  ) {
    this.steps = new DocumentWriteSteps(
      areas,
      users,
      documents,
      storage,
      audit,
    );
  }

  // R3, R4, R5. Orden: 404, 409 archivado, sin cambios (D4), 400 de áreas y responsable, escritura.
  changeAreas(
    id: string,
    dto: ChangeAreasDto,
    actor: AuthUser,
  ): Promise<DocumentResponse> {
    return this.run(
      'DOCUMENT_AREAS_CHANGE',
      'cambio de áreas',
      id,
      actor,
      async () => {
        const current = await this.findWritable(id);

        // D4: si no cambia nada, se responde sin escribir ni auditar.
        const ownerId = dto.ownerId ?? current.ownerId;
        if (
          sameAreas(current.areaIds, dto.areaIds) &&
          ownerId === current.ownerId
        ) {
          return current;
        }

        await this.steps.assertAreasExist(dto.areaIds);
        // El responsable que va a quedar: el nuevo si vino, si no el actual (R4).
        await this.steps.assertOwnerCanSeeDocument(ownerId, dto.areaIds);

        return this.documents.runInTransaction(async (tx) => {
          await this.lockWritable(tx, id);
          const updated = await this.documents.replaceAreas(
            tx,
            id,
            dto.areaIds,
            dto.ownerId,
          );
          await this.audit.record(
            {
              action: 'DOCUMENT_AREAS_CHANGE',
              actorId: actor.id,
              documentId: id,
              result: 'SUCCESS',
              at: new Date(),
            },
            tx,
          );
          return updated;
        });
      },
    );
  }

  // R6 a R9, en el orden de la tabla de la sección 4 del plan 003: primero todo lo que se puede
  // rechazar sin escribir; después el archivo nuevo y, al final, la transacción. Si la transacción
  // no se confirma, se borra solo el archivo nuevo: el de la versión anterior queda (D6).
  addVersion(
    id: string,
    file: UploadedFileInput | undefined,
    dto: CreateVersionDto,
    actor: AuthUser,
  ): Promise<DocumentResponse> {
    return this.run(
      'DOCUMENT_VERSION_UPLOAD',
      'versión nueva',
      id,
      actor,
      async () => {
        const inspected = inspectFile(file); // 3b: 400 o 415
        if (dto.reviewDate) {
          this.steps.assertReviewDateIsAfterToday(dto.reviewDate); // 3c
        }
        await this.findWritable(id); // 3d: 404 o 409
        // 3e: igual a la vigente de este documento (R6b) o de otro (R8b de la spec 001).
        const duplicate = await this.documents.findActiveByChecksum(
          inspected.checksum,
        );
        if (duplicate?.documentId === id) throw identicalToCurrent();
        if (duplicate) throw duplicateDocumentConflict(duplicate.documentId);

        const uploaded = file as UploadedFileInput;
        const versionId = randomUUID();
        const key = `documents/${id}/${versionId}.${inspected.extension}`;

        return this.steps.storeThenCommit(
          {
            key,
            documentId: id,
            buffer: uploaded.buffer,
            mimeType: inspected.mimeType,
            checksum: inspected.checksum,
          },
          () =>
            this.documents.runInTransaction(async (tx) => {
              // 5a: bajo el bloqueo valen el estado y la versión vigente de ahora (plan 003, 4).
              const locked = await this.lockWritable(tx, id);
              if (locked.currentVersion.checksum === inspected.checksum) {
                throw identicalToCurrent();
              }

              const updated = await this.addVersionOrConflict(
                tx,
                id,
                {
                  id: versionId,
                  storageKey: key,
                  originalFileName: truncateFileName(uploaded.originalname),
                  mimeType: inspected.mimeType,
                  sizeBytes: inspected.sizeBytes,
                  checksum: inspected.checksum,
                  uploadedById: actor.id,
                },
                dto.reviewDate
                  ? new Date(`${dto.reviewDate}T00:00:00.000Z`)
                  : undefined,
              );

              await this.audit.record(
                {
                  action: 'DOCUMENT_VERSION_UPLOAD',
                  actorId: actor.id,
                  documentId: id,
                  result: 'SUCCESS',
                  at: new Date(),
                },
                tx,
              );

              // 5e: el último paso de la transacción (R7, D12 del plan 001).
              await this.queue.enqueue(versionId);
              return updated;
            }),
        );
      },
    );
  }

  // R10, R11. Archiva el documento y desactiva todos sus fragmentos; los archivos quedan (D6).
  archive(id: string, actor: AuthUser): Promise<DocumentResponse> {
    return this.run('DOCUMENT_ARCHIVE', 'archivo', id, actor, async () => {
      await this.findWritable(id);
      return this.documents.runInTransaction(async (tx) => {
        await this.lockWritable(tx, id);
        const archived = await this.documents.archive(tx, id, new Date());
        await this.audit.record(
          {
            action: 'DOCUMENT_ARCHIVE',
            actorId: actor.id,
            documentId: id,
            result: 'SUCCESS',
            at: new Date(),
          },
          tx,
        );
        return archived;
      });
    });
  }

  // 5b y 5c. El choque con el índice de una sola CURRENT es 409, no 503 (plan 003, 5).
  private async addVersionOrConflict(
    ...args: Parameters<DocumentsRepository['addVersion']>
  ): Promise<DocumentRecord> {
    try {
      return await this.documents.addVersion(...args);
    } catch (error) {
      if (error instanceof ConcurrentVersionError) throw concurrentVersion();
      throw error;
    }
  }

  // Corre una operación sobre el documento `id` y, si falla, la convierte en su HttpException y
  // audita FAILURE (R13) con el documento, salvo en el 404: ese documento no existe.
  private async run(
    action: AuditAction,
    operation: HttpOperation,
    id: string,
    actor: AuthUser,
    operate: () => Promise<DocumentRecord>,
  ): Promise<DocumentResponse> {
    try {
      return toDocumentResponse(await operate());
    } catch (error) {
      const failure = toHttpException(error, this.logger, operation);
      await this.steps.auditFailure(
        action,
        actor,
        failure.getStatus(),
        failure instanceof NotFoundException ? undefined : id,
      );
      throw failure;
    }
  }

  // Primera lectura, fuera de la transacción: 404 (R2) y 409 si está archivado (R11).
  private async findWritable(id: string): Promise<DocumentRecord> {
    const record = await this.documents.findByIdWithAreas(id);
    if (!record) throw documentNotFound();
    if (record.status === 'ARCHIVED') throw documentArchived();
    return record;
  }

  // Bloqueo y nueva lectura (plan 003, 3.3): otro ADMIN pudo archivarlo después de la primera.
  private async lockWritable(
    tx: RepositoryTransaction,
    id: string,
  ): Promise<DocumentRecord> {
    const locked = await this.documents.lockForUpdate(tx, id);
    if (!locked) throw documentNotFound();
    if (locked.status === 'ARCHIVED') throw documentArchived();
    return locked;
  }
}
