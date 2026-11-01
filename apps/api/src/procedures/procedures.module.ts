/* Wires the procedures feature: which implementation backs each port (spec 006) */
import { Module } from '@nestjs/common';
import { PrismaProcedureAreasCatalog } from './prisma-procedure-areas.catalog';
import { ProcedureAreasCatalog } from './procedure-areas.catalog';
import { ProcedureAreasService } from './procedure-areas.service';
import { ProcedureDraftService } from './procedure-draft.service';
import { PrismaProceduresRepository } from './prisma-procedures.repository';
import { ProceduresController } from './procedures.controller';
import { ProceduresRepository } from './procedures.repository';

// PrismaService comes from the global PrismaModule. The areas catalog is the procedures' own port
// (D17): it only reads areas, so the ports of Documents stay as they are; UsersDirectory joins the
// providers when visibility arrives (HU11).
@Module({
  controllers: [ProceduresController],
  providers: [
    ProcedureDraftService,
    ProcedureAreasService,
    { provide: ProceduresRepository, useClass: PrismaProceduresRepository },
    { provide: ProcedureAreasCatalog, useClass: PrismaProcedureAreasCatalog },
  ],
})
export class ProceduresModule {}
