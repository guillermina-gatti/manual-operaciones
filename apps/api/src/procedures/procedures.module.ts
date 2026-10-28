/* Wires the procedures feature: which implementation backs each port (spec 006) */
import { Module } from '@nestjs/common';
import { ProcedureDraftService } from './procedure-draft.service';
import { PrismaProceduresRepository } from './prisma-procedures.repository';
import { ProceduresController } from './procedures.controller';
import { ProceduresRepository } from './procedures.repository';

// PrismaService comes from the global PrismaModule. UsersDirectory and AreasDirectory join the
// providers when areas and visibility arrive (HU10 and HU11).
@Module({
  controllers: [ProceduresController],
  providers: [
    ProcedureDraftService,
    { provide: ProceduresRepository, useClass: PrismaProceduresRepository },
  ],
})
export class ProceduresModule {}
