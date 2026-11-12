/* Wires the executions feature: which implementation backs each port (spec 005) */
import { Module } from '@nestjs/common';
import { PrismaAreasDirectory } from '../documents/adapters/prisma-areas-directory';
import { PrismaUsersDirectory } from '../documents/adapters/prisma-users-directory';
import { AreasDirectory } from '../documents/ports/areas-directory';
import { UsersDirectory } from '../documents/ports/users-directory';
import { PrismaProceduresCatalog } from '../procedures/adapters/prisma-procedures-catalog';
import { ExecutionService } from './execution.service';
import { ExecutionsController } from './executions.controller';
import { ExecutionsRepository } from './executions.repository';
import { AssistantMetricsController } from './metrics/assistant-metrics.controller';
import { AssistantMetricsRepository } from './metrics/assistant-metrics.repository';
import { AssistantMetricsService } from './metrics/assistant-metrics.service';
import { ExecutionMetricsRepository } from './metrics/execution-metrics.repository';
import { MyMetricsController } from './metrics/my-metrics.controller';
import { MyMetricsService } from './metrics/my-metrics.service';
import { PrismaAssistantMetricsRepository } from './metrics/prisma-assistant-metrics.repository';
import { PrismaExecutionMetricsRepository } from './metrics/prisma-execution-metrics.repository';
import { ProcedureMetricsController } from './metrics/procedure-metrics.controller';
import { ProcedureMetricsService } from './metrics/procedure-metrics.service';
import { Clock, SystemClock } from './ports/clock';
import { ProceduresCatalog } from './ports/procedures-catalog';
import { PrismaExecutionsRepository } from './prisma-executions.repository';

// PrismaService comes from the global PrismaModule. Simulations are swapped here,
// one line each, when the real implementation arrives. The procedures metrics (HU38)
// and the personal metrics of the employee live here because they read these same
// tables and ports.
@Module({
  controllers: [
    ExecutionsController,
    ProcedureMetricsController,
    MyMetricsController,
    // The assistant metrics (HU38) only read the chat tables of pair C.
    AssistantMetricsController,
  ],
  providers: [
    ExecutionService,
    ProcedureMetricsService,
    MyMetricsService,
    AssistantMetricsService,
    {
      provide: AssistantMetricsRepository,
      useClass: PrismaAssistantMetricsRepository,
    },
    {
      provide: ExecutionMetricsRepository,
      useClass: PrismaExecutionMetricsRepository,
    },
    // The published procedures of Mica (HU11). It only needs the global PrismaService, so
    // ProceduresModule does not have to export it. The e2e tests swap in the in-memory one.
    { provide: ProceduresCatalog, useClass: PrismaProceduresCatalog },
    { provide: UsersDirectory, useClass: PrismaUsersDirectory },
    { provide: AreasDirectory, useClass: PrismaAreasDirectory },
    { provide: ExecutionsRepository, useClass: PrismaExecutionsRepository },
    { provide: Clock, useClass: SystemClock },
  ],
})
export class ExecutionsModule {}
