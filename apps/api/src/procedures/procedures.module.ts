/* Wires the procedures feature: which implementation backs each port (spec 006) */
import { Module } from '@nestjs/common';
import { PrismaAreasDirectory } from '../documents/adapters/prisma-areas-directory';
import { AreasDirectory } from '../documents/ports/areas-directory';
import { ProcedureAreasService } from './procedure-areas.service';
import { ProcedureDraftService } from './procedure-draft.service';
import { PrismaProceduresRepository } from './prisma-procedures.repository';
import { ProceduresController } from './procedures.controller';
import { ProceduresRepository } from './procedures.repository';

// PrismaService comes from the global PrismaModule. AreasDirectory is the one of Pareja A, used
// as it is (findByIds says which areas exist and which are active, D17); UsersDirectory joins
// the providers when visibility arrives (HU11).
@Module({
  controllers: [ProceduresController],
  providers: [
    ProcedureDraftService,
    ProcedureAreasService,
    { provide: ProceduresRepository, useClass: PrismaProceduresRepository },
    { provide: AreasDirectory, useClass: PrismaAreasDirectory },
  ],
})
export class ProceduresModule {}
