/* Ciclo de vida de un documento que ya existe: cambiar áreas, subir nueva versión y archivar. */

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

// Error 404: El documento no existe
const documentNotFound = () =>
  new NotFoundException('No se encontró el documento');

// Error 409: El documento está archivado y ya no se puede modificar
const documentArchived = () =>
  new ConflictException({
    statusCode: 409,
    message: 'El documento está archivado',
    error: 'Conflict',
    reason: 'ARCHIVED',
  });

// Error 409: El archivo nuevo es idéntico a la versión que ya está vigente
const identicalToCurrent = () =>
  new ConflictException({
    statusCode: 409,
    message: 'El archivo es igual a la versión vigente',
    error: 'Conflict',
    reason: 'IDENTICAL_TO_CURRENT',
  });

// Error 409: Conflicto por competencia de versiones al mismo tiempo
const concurrentVersion = () =>
  new ConflictException({
    statusCode: 409,
    message: 'Otra versión nueva se cargó al mismo tiempo. Probá de nuevo.',
    error: 'Conflict',
    reason: 'CONCURRENT_VERSION',
  });

// Comprueba si las áreas nuevas son exactamente iguales a las actuales
const sameAreas = (current: string[], next: string[]) =>
  current.length === next.length && next.every((id) => current.includes(id));

@Injectable()
export class DocumentLifecycleService {
  private readonly logger = new Logger(DocumentLifecycleService.name);
  private readonly steps: DocumentWriteSteps;

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

  // Cambia las áreas o el responsable de un documento existente
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

        const ownerId = dto.ownerId ?? current.ownerId;
        // Si no hubo cambios reales, devuelve el documento actual sin escribir nada
        if (
          sameAreas(current.areaIds, dto.areaIds) &&
          ownerId === current.ownerId
        ) {
          return current;
        }

        await this.steps.assertAreasExist(dto.areaIds);
        await this.steps.assertOwnerCanSeeDocument(ownerId, dto.areaIds);

        // Aplica el cambio bajo transacción y bloqueo
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

  // Sube una nueva versión de un archivo para un documento existente
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
        const inspected = inspectFile(file); // Valida el archivo
        if (dto.reviewDate) {
          this.steps.assertReviewDateIsAfterToday(dto.reviewDate);
        }
        await this.findWritable(id); // Valida que exista y no esté archivado

        const duplicate = await this.documents.findActiveByChecksum(
          inspected.checksum,
        );
        if (duplicate?.documentId === id) throw identicalToCurrent();
        if (duplicate) throw duplicateDocumentConflict(duplicate.documentId);

        const uploaded = file as UploadedFileInput;
        const versionId = randomUUID();
        const key = `documents/${id}/${versionId}.${inspected.extension}`;

        // Almacena el archivo y confirma la transacción de la nueva versión
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

              await this.queue.enqueue(versionId);
              return updated;
            }),
        );
      },
    );
  }

  // Archiva un documento existente (lo desactiva)
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

  // Maneja conflictos si dos versiones se intentan subir al mismo tiempo
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

  // Ejecuta la operación y audita el fallo en caso de ocurrir un error
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

  // Verifica que el documento exista y no esté archivado (lectura previa)
  private async findWritable(id: string): Promise<DocumentRecord> {
    const record = await this.documents.findByIdWithAreas(id);
    if (!record) throw documentNotFound();
    if (record.status === 'ARCHIVED') throw documentArchived();
    return record;
  }

  // Bloquea el registro en la base de datos para escritura segura dentro de la transacción
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
