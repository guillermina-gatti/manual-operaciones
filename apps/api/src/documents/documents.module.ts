/* Arma la feature de documentos: qué implementación usa cada puerto (plan 5) */

import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { FakeProcessingQueue } from './adapters/fake-processing-queue';
import { InMemoryAreasDirectory } from './adapters/in-memory-areas-directory';
import { InMemoryUsersDirectory } from './adapters/in-memory-users-directory';
import { LoggerAuditLog } from './adapters/logger-audit-log';
import { DocumentUploadService } from './document-upload.service';
import { DocumentsController } from './documents.controller';
import { DocumentsRepository } from './documents.repository';
import { AreasDirectory } from './ports/areas-directory';
import { AuditLog } from './ports/audit-log';
import { ProcessingQueue } from './ports/processing-queue';
import { UsersDirectory } from './ports/users-directory';
import { PrismaDocumentsRepository } from './prisma-documents.repository';

// FileStorage lo elige StorageModule (S3 o memoria, según el entorno). PrismaService llega del
// PrismaModule global. Las simulaciones se cambian acá, una línea cada una, cuando llegue la real.
@Module({
  imports: [StorageModule],
  controllers: [DocumentsController],
  providers: [
    DocumentUploadService,
    { provide: DocumentsRepository, useClass: PrismaDocumentsRepository }, // T18 (plan 5.6)
    { provide: ProcessingQueue, useClass: FakeProcessingQueue }, // hasta ProcessingService de Guille (plan 5.2)
    { provide: AreasDirectory, useClass: InMemoryAreasDirectory }, // hasta las áreas de A (plan 5.3)
    { provide: UsersDirectory, useClass: InMemoryUsersDirectory }, // hasta los usuarios de A (plan 5.3)
    { provide: AuditLog, useClass: LoggerAuditLog }, // hasta resolver A1 (plan 5.4)
  ],
})
export class DocumentsModule {}
