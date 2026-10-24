/* Ciclo de vida de un documento que ya existe (spec 003): cambiar sus áreas, subir una versión
nueva y archivarlo. Usa los mismos pasos de escritura que la carga (DocumentWriteSteps). */

import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { AuthUser } from '../common/auth';
import { FileStorage } from '../storage/file-storage';
import { DocumentWriteSteps } from './document-write-steps';
import {
  DocumentRecord,
  DocumentsRepository,
  RepositoryTransaction,
} from './documents.repository';
import { ChangeAreasDto } from './dto/change-areas.dto';
import { DocumentResponse, toDocumentResponse } from './dto/document.response';
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
