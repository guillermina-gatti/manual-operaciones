/* Wires the procedures feature: which implementation backs each port (spec 006) */
import { Module } from '@nestjs/common';
import { PrismaAreasDirectory } from '../documents/adapters/prisma-areas-directory';
import { PrismaUsersDirectory } from '../documents/adapters/prisma-users-directory';
import { AreasDirectory } from '../documents/ports/areas-directory';
import { UsersDirectory } from '../documents/ports/users-directory';
import { ProcedureAreasService } from './procedure-areas.service';
import { ProcedureDraftService } from './procedure-draft.service';
import { ProcedureHistoryService } from './procedure-history.service';
import { ProcedurePublishService } from './procedure-publish.service';
import { ProcedureVersionsController } from './procedure-versions.controller';
import { PrismaProceduresRepository } from './prisma-procedures.repository';
import { PrismaPublishRepository } from './prisma-publish.repository';
import { PrismaVersionsRepository } from './prisma-versions.repository';
import { ProceduresController } from './procedures.controller';
import { ProceduresRepository } from './procedures.repository';
import { PublishRepository } from './publish.repository';
import { VersionsRepository } from './versions.repository';

// PrismaService comes from the global PrismaModule. AreasDirectory and UsersDirectory are the ones
// of Pareja A and documents, used as they are: areas (D17) and the name of who published (spec 015, D6).
@Module({
  controllers: [ProceduresController, ProcedureVersionsController],
  providers: [
    ProcedureDraftService,
    ProcedureAreasService,
    ProcedurePublishService,
    ProcedureHistoryService,
    { provide: ProceduresRepository, useClass: PrismaProceduresRepository },
    { provide: PublishRepository, useClass: PrismaPublishRepository },
    { provide: VersionsRepository, useClass: PrismaVersionsRepository },
    { provide: AreasDirectory, useClass: PrismaAreasDirectory },
    { provide: UsersDirectory, useClass: PrismaUsersDirectory },
  ],
})
export class ProceduresModule {}
