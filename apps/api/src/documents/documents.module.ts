/* Arma la feature de documentos: qué implementación usa cada puerto (plan 5) */

import { Module } from '@nestjs/common';
import { Clock, SystemClock } from '../common/clock';
import { ProcessingModule } from '../processing/processing.module';
import { StorageModule } from '../storage/storage.module';
import { LoggerAuditLog } from './adapters/logger-audit-log';
import { PrismaAreasDirectory } from './adapters/prisma-areas-directory';
import { PrismaUsersDirectory } from './adapters/prisma-users-directory';
import { ConflictAlertsController } from './conflict-alerts/conflict-alerts.controller';
import { ConflictAlertsRepository } from './conflict-alerts/conflict-alerts.repository';
import { ConflictAlertsService } from './conflict-alerts/conflict-alerts.service';
import { PrismaConflictAlertsRepository } from './conflict-alerts/prisma-conflict-alerts.repository';
import { DocumentLifecycleService } from './document-lifecycle.service';
import { DocumentQueryService } from './document-query.service';
import { DocumentUploadService } from './document-upload.service';
import { DocumentsController } from './documents.controller';
import { DocumentsRepository } from './documents.repository';
import { DocumentMetricsController } from './metrics/document-metrics.controller';
import { DocumentMetricsRepository } from './metrics/document-metrics.repository';
import { DocumentMetricsService } from './metrics/document-metrics.service';
import { PrismaDocumentMetricsRepository } from './metrics/prisma-document-metrics.repository';
import { AreasDirectory } from './ports/areas-directory';
import { AuditLog } from './ports/audit-log';
import { UsersDirectory } from './ports/users-directory';
import { PrismaDocumentsRepository } from './prisma-documents.repository';

// FileStorage lo elige StorageModule (S3 o memoria, según el entorno). PrismaService llega del
// PrismaModule global. ProcessingQueue (la cola real de HU14) la exporta ProcessingModule.
// Las simulaciones se cambian acá, una línea cada una, cuando llegue la real.
@Module({
  imports: [StorageModule, ProcessingModule],
  controllers: [
    DocumentsController,
    DocumentMetricsController, // GET /metrics/documents (spec 007)
    ConflictAlertsController, // GET /conflict-alerts y POST /conflict-alerts/:id/resolve (spec 011)
  ],
  providers: [
    DocumentUploadService,
    DocumentQueryService,
    DocumentLifecycleService,
    DocumentMetricsService, // spec 007
    ConflictAlertsService, // spec 011
    {
      provide: ConflictAlertsRepository,
      useClass: PrismaConflictAlertsRepository,
    },
    {
      provide: DocumentMetricsRepository,
      useClass: PrismaDocumentMetricsRepository,
    },
    { provide: DocumentsRepository, useClass: PrismaDocumentsRepository }, // T18 (plan 5.6)
    { provide: AreasDirectory, useClass: PrismaAreasDirectory },
    { provide: UsersDirectory, useClass: PrismaUsersDirectory },
    { provide: AuditLog, useClass: LoggerAuditLog }, // hasta resolver A1 (plan 5.4)
    { provide: Clock, useClass: SystemClock }, // "hoy" de la fecha de revisión (spec 005, D2)
  ],
})
export class DocumentsModule {}
