/* Arma la feature de documentos: qué implementación usa cada puerto (plan 5) */

import { Module } from '@nestjs/common';
import { Clock, SystemClock } from '../common/clock';
import { StorageModule } from '../storage/storage.module';
import { FakeProcessingQueue } from './adapters/fake-processing-queue';
import { LoggerAuditLog } from './adapters/logger-audit-log';
import { PrismaAreasDirectory } from './adapters/prisma-areas-directory';
import { PrismaUsersDirectory } from './adapters/prisma-users-directory';
import { DocumentLifecycleService } from './document-lifecycle.service';
import { DocumentQueryService } from './document-query.service';
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
    DocumentQueryService,
    DocumentLifecycleService,
    { provide: DocumentsRepository, useClass: PrismaDocumentsRepository }, // T18 (plan 5.6)
    { provide: ProcessingQueue, useClass: FakeProcessingQueue }, // hasta ProcessingService de Guille (plan 5.2)
    { provide: AreasDirectory, useClass: PrismaAreasDirectory },
    { provide: UsersDirectory, useClass: PrismaUsersDirectory },
    { provide: AuditLog, useClass: LoggerAuditLog }, // hasta resolver A1 (plan 5.4)
    { provide: Clock, useClass: SystemClock }, // "hoy" de la fecha de revisión (spec 005, D2)
  ],
})
export class DocumentsModule {}
