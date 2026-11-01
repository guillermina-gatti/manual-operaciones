import { Test } from '@nestjs/testing';
import { JwtAuthGuard } from '../common/auth';
import { PrismaAreasDirectory } from '../documents/adapters/prisma-areas-directory';
import { AreasDirectory } from '../documents/ports/areas-directory';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import { ProcedureAreasService } from './procedure-areas.service';
import { ProcedureDraftService } from './procedure-draft.service';
import { PrismaProceduresRepository } from './prisma-procedures.repository';
import { ProceduresController } from './procedures.controller';
import { ProceduresModule } from './procedures.module';
import { ProceduresRepository } from './procedures.repository';

describe('ProceduresModule', () => {
  it('wires the repository to its Prisma adapter and builds the service and controller', async () => {
    // PrismaModule is global in the app; here it is imported with a fake client. The real
    // JwtAuthGuard needs the global AuthModule, which is not under test here: the controller
    // spec runs behind it.
    const moduleRef = await Test.createTestingModule({
      imports: [PrismaModule, ProceduresModule],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    expect(moduleRef.get(ProceduresRepository)).toBeInstanceOf(
      PrismaProceduresRepository,
    );
    expect(moduleRef.get(AreasDirectory)).toBeInstanceOf(PrismaAreasDirectory);
    expect(moduleRef.get(ProcedureDraftService)).toBeInstanceOf(
      ProcedureDraftService,
    );
    expect(moduleRef.get(ProcedureAreasService)).toBeInstanceOf(
      ProcedureAreasService,
    );
    expect(moduleRef.get(ProceduresController)).toBeInstanceOf(
      ProceduresController,
    );
  });
});
