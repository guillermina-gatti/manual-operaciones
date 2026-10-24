import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { AuthUser } from '../common/auth';
import { FileStorage } from '../storage/file-storage';
import { DocumentWriteSteps, truncateFileName } from './document-write-steps';
import { DocumentRecord, DocumentsRepository } from './documents.repository';
import { CreateDocumentDto } from './dto/create-document.dto';
import { DocumentResponse, toDocumentResponse } from './dto/document.response';
import {
  InspectedFile,
  UploadedFileInput,
  inspectFile,
} from './file-inspector';
import { toHttpException } from './http-errors';
import { AreasDirectory } from './ports/areas-directory';
import { AuditLog } from './ports/audit-log';
import { ProcessingQueue } from './ports/processing-queue';
import { UsersDirectory } from './ports/users-directory';

// Servicio que orquesta todo el flujo de subida de documentos.
// Las validaciones, el guardado con compensación y la auditoría de fallos los comparte con el
// ciclo de vida (spec 003) a través de DocumentWriteSteps.
@Injectable()
export class DocumentUploadService {
  private readonly logger = new Logger(DocumentUploadService.name);
  private readonly steps: DocumentWriteSteps;

  // Inyección de todas las dependencias necesarias (puertos y repositorios)
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
      await this.steps.auditFailure(
        'DOCUMENT_UPLOAD',
        actor,
        failure.getStatus(),
      );
      throw failure;
    }
  }

  // Realiza los pasos de escritura garantizando "todo o nada"
  private write(
    file: UploadedFileInput,
    inspected: InspectedFile,
    dto: CreateDocumentDto,
    actor: AuthUser,
  ): Promise<DocumentRecord> {
    // Genera identificadores únicos y la ruta dentro del almacenamiento
    const documentId = randomUUID();
    const versionId = randomUUID();
    const key = `documents/${documentId}/${versionId}.${inspected.extension}`;

    // Sube el archivo y abre la transacción: si la transacción no se confirma, el archivo se borra
    return this.steps.storeThenCommit(
      {
        key,
        documentId,
        buffer: file.buffer,
        mimeType: inspected.mimeType,
        checksum: inspected.checksum,
      },
      () =>
        this.documents.runInTransaction(async (tx) => {
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
              originalFileName: truncateFileName(file.originalname),
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
        }),
    );
  }

  // Agrupa todas las validaciones previas antes de tocar la base de datos o almacenamiento
  private async validateBeforeWriting(
    file: UploadedFileInput | undefined,
    dto: CreateDocumentDto,
  ): Promise<InspectedFile> {
    const inspected = inspectFile(file); // Valida formato y contenido binario
    this.steps.assertReviewDateIsAfterToday(dto.reviewDate); // Valida fecha
    await this.steps.assertAreasExist(dto.areaIds); // Valida que las áreas existan
    await this.steps.assertOwnerCanSeeDocument(dto.ownerId, dto.areaIds); // Valida que el responsable pertenezca al área
    await this.steps.assertNotDuplicated(inspected.checksum); // Valida que no esté repetido
    return inspected;
  }
}
