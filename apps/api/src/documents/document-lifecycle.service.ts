/* Ciclo de vida de un documento que ya existe: cambiar áreas, subir nueva versión y archivar. */

import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { AuthUser } from '../common/auth';
import { Clock, SystemClock } from '../common/clock';
import { FileStorage } from '../storage/file-storage';
import { toDbDate, todayInCompany } from './company-date';
import { findVisibleDocument } from './document-access';
import { canReview } from './document-access.policy';
import {
  DocumentReferences,
  ReferenceIds,
  ReferenceLookup,
  referenceIdsOf,
} from './document-references';
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
import { MarkReviewedDto } from './dto/mark-reviewed.dto';
import { UploadedFileInput, inspectFile } from './file-inspector';
import { HttpOperation, toHttpException } from './http-errors';
import { AreasDirectory } from './ports/areas-directory';
import { AuditAction, AuditLog, ReviewAuditDates } from './ports/audit-log';
import { ProcessingQueue } from './ports/processing-queue';
import { UsersDirectory } from './ports/users-directory';
import { reviewFor } from './review-status';

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

// Error 403: lo ve, pero no es el ADMIN ni el responsable (spec 005, R6)
const cannotReview = () =>
  new ForbiddenException(
    'Solo el ADMIN o el responsable pueden marcar el documento como revisado',
  );

// Una columna @db.Date llega como medianoche UTC: la fecha YYYY-MM-DD, en UTC.
const toDateOnly = (date: Date) => date.toISOString().slice(0, 10);

// Lo que deja una escritura: el registro y los nombres que se buscaron antes de escribir (spec 008, PD5).
interface WriteResult {
  record: DocumentRecord;
  refs: ReferenceLookup;
}

// Comprueba si las áreas nuevas son exactamente iguales a las actuales
const sameAreas = (current: string[], next: string[]) =>
  current.length === next.length && next.every((id) => current.includes(id));

@Injectable()
export class DocumentLifecycleService {
  private readonly logger = new Logger(DocumentLifecycleService.name);
  private readonly steps: DocumentWriteSteps;
  private readonly references: DocumentReferences;

  constructor(
    areas: AreasDirectory,
    private readonly users: UsersDirectory,
    private readonly documents: DocumentsRepository,
    storage: FileStorage,
    private readonly queue: ProcessingQueue,
    private readonly audit: AuditLog,
    private readonly clock: Clock = new SystemClock(),
  ) {
    this.steps = new DocumentWriteSteps(
      areas,
      users,
      documents,
      storage,
      audit,
      clock,
    );
    this.references = new DocumentReferences(users, areas);
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
        // Si no hubo cambios reales, devuelve el documento actual sin escribir nada (R11), con sus
        // nombres (spec 008, plan 1.4)
        if (
          sameAreas(current.areaIds, dto.areaIds) &&
          ownerId === current.ownerId
        ) {
          return {
            record: current,
            refs: await this.references.lookup(this.idsFor(actor, current)),
          };
        }

        // Spec 008 (R7, R8): las agregadas tienen que estar activas; las que ya tenía se conservan
        await this.steps.assertAreasCanBeAssigned(dto.areaIds, current.areaIds);
        // Spec 008 (R6, P5): el actual no se rechaza por inactivo, pero tiene que seguir teniendo acceso
        await this.steps.assertOwnerCanSeeDocument(ownerId, dto.areaIds, {
          isNew: ownerId !== current.ownerId,
        });

        // Spec 008 (PD5): los nombres de cómo va a quedar, antes de escribir (después de validar)
        const refs = await this.references.lookup(
          this.idsFor(actor, { ...current, areaIds: dto.areaIds, ownerId }),
        );

        // Aplica el cambio bajo transacción y bloqueo
        const record = await this.documents.runInTransaction(async (tx) => {
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
        return { record, refs };
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
        const current = await this.findWritable(id); // Valida que exista y no esté archivado

        const duplicate = await this.documents.findActiveByChecksum(
          inspected.checksum,
        );
        if (duplicate?.documentId === id) throw identicalToCurrent();
        if (duplicate) throw duplicateDocumentConflict(duplicate.documentId);

        // Spec 008 (PD5): los nombres antes de escribir. Con fecha nueva, el actor queda como revisor
        // (R10 de la spec 005).
        const refs = await this.references.lookup(
          this.idsFor(actor, current, dto.reviewDate ? [actor.id] : []),
        );

        const uploaded = file as UploadedFileInput;
        const versionId = randomUUID();
        const key = `documents/${id}/${versionId}.${inspected.extension}`;

        // Almacena el archivo y confirma la transacción de la nueva versión
        const record = await this.steps.storeThenCommit(
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
        return { record, refs };
      },
    );
  }

  // Archiva un documento existente (lo desactiva)
  archive(id: string, actor: AuthUser): Promise<DocumentResponse> {
    return this.run('DOCUMENT_ARCHIVE', 'archivo', id, actor, async () => {
      const current = await this.findWritable(id);
      // Spec 008 (PD5): los nombres antes de escribir
      const refs = await this.references.lookup(this.idsFor(actor, current));
      const record = await this.documents.runInTransaction(async (tx) => {
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
      return { record, refs };
    });
  }

  // "Marcar como revisado" (spec 005, R6 a R9; plan 3.2). El orden de los controles: la fecha, que
  // solo depende de la petición (400); que exista y se vea (404); que sea el ADMIN o el responsable
  // (403); que no esté archivado (409). Después, lo mismo bajo el bloqueo. Cambia solo la fecha y la
  // última revisión: no crea versión ni toca el archivo ni los fragmentos (R8).
  markReviewed(
    id: string,
    dto: MarkReviewedDto,
    actor: AuthUser,
  ): Promise<DocumentResponse> {
    // R12: las fechas que se conocen, también para auditar un fallo. La anterior, la última leída.
    const dates: ReviewAuditDates = { newReviewDate: dto.reviewDate };
    return this.run(
      'DOCUMENT_REVIEW',
      'revisión',
      id,
      actor,
      async () => {
        this.steps.assertReviewDateIsAfterToday(dto.reviewDate);

        const visible = await findVisibleDocument(
          this.users,
          this.documents,
          actor,
          id,
        );
        dates.previousReviewDate = toDateOnly(visible.reviewDate);
        if (!canReview(actor, visible)) throw cannotReview();
        if (visible.status === 'ARCHIVED') throw documentArchived();

        // Spec 008 (PD5, E8): los nombres antes de escribir; el actor va a ser el revisor
        const refs = await this.references.lookup(
          this.idsFor(actor, visible, [actor.id]),
        );

        const record = await this.documents.runInTransaction(async (tx) => {
          const locked = await this.lockWritable(tx, id);
          // La fecha que de verdad se reemplaza es la leída bajo el bloqueo: con dos revisiones a
          // la vez, la segunda registra la que dejó la primera.
          dates.previousReviewDate = toDateOnly(locked.reviewDate);
          if (!canReview(actor, locked)) throw cannotReview();

          const at = this.clock.now();
          const reviewed = await this.documents.markReviewed(tx, id, {
            reviewDate: toDbDate(dto.reviewDate),
            reviewedById: actor.id,
            at,
          });
          await this.audit.record(
            {
              action: 'DOCUMENT_REVIEW',
              actorId: actor.id,
              documentId: id,
              result: 'SUCCESS',
              previousReviewDate: dates.previousReviewDate,
              newReviewDate: dto.reviewDate,
              at,
            },
            tx,
          );
          return reviewed;
        });
        return { record, refs };
      },
      dates,
    );
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
    operate: () => Promise<WriteResult>,
    auditDates?: ReviewAuditDates,
  ): Promise<DocumentResponse> {
    try {
      const { record, refs } = await operate();
      // Spec 005 (R4): la respuesta lleva el estado de revisión si el actor puede verlo.
      const today = todayInCompany(this.clock.now());
      const review = reviewFor(actor, record, today);
      // Spec 008 (PD5): lo que trae el registro y no se buscó antes se pide ahora, sin fallar.
      const complete = await this.references.complete(
        refs,
        referenceIdsOf([{ record, withReview: review !== undefined }]),
      );
      return toDocumentResponse(record, complete, review);
    } catch (error) {
      const failure = toHttpException(error, this.logger, operation);
      await this.steps.auditFailure(
        action,
        actor,
        failure.getStatus(),
        failure instanceof NotFoundException ? undefined : id,
        auditDates,
      );
      throw failure;
    }
  }

  // Spec 008 (plan 1.4): los IDs que necesita la respuesta de ese documento, más los usuarios que la
  // escritura va a agregar (el revisor). El revisor actual, solo si la respuesta lleva review (PD3).
  private idsFor(
    actor: AuthUser,
    record: DocumentRecord,
    extraUserIds: string[] = [],
  ): ReferenceIds {
    const today = todayInCompany(this.clock.now());
    const ids = referenceIdsOf([
      { record, withReview: reviewFor(actor, record, today) !== undefined },
    ]);
    return { ...ids, userIds: [...ids.userIds, ...extraUserIds] };
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
