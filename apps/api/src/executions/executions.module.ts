/* Wires the executions feature: which implementation backs each port (spec 005) */
import { Module } from '@nestjs/common';
import { PrismaUsersDirectory } from '../documents/adapters/prisma-users-directory';
import { UsersDirectory } from '../documents/ports/users-directory';
import { InMemoryProceduresCatalog } from './adapters/in-memory-procedures-catalog';
import { ExecutionService } from './execution.service';
import { ExecutionsController } from './executions.controller';
import { ExecutionsRepository } from './executions.repository';
import { Clock, SystemClock } from './ports/clock';
import { ProceduresCatalog } from './ports/procedures-catalog';
import { PrismaExecutionsRepository } from './prisma-executions.repository';

// PrismaService comes from the global PrismaModule. Simulations are swapped here,
// one line each, when the real implementation arrives.
@Module({
  controllers: [ExecutionsController],
  providers: [
    ExecutionService,
    { provide: ProceduresCatalog, useClass: InMemoryProceduresCatalog }, // until Mica's catalog
    { provide: UsersDirectory, useClass: PrismaUsersDirectory },
    { provide: ExecutionsRepository, useClass: PrismaExecutionsRepository },
    { provide: Clock, useClass: SystemClock },
  ],
})
export class ExecutionsModule {}
