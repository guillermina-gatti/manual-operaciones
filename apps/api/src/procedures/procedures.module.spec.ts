import { Test } from '@nestjs/testing';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import { ProcedureDraftService } from './procedure-draft.service';
import { PrismaProceduresRepository } from './prisma-procedures.repository';
import { ProceduresController } from './procedures.controller';
import { ProceduresModule } from './procedures.module';
import { ProceduresRepository } from './procedures.repository';

describe('ProceduresModule', () => {
  it('wires the repository to its Prisma adapter and builds the service and controller', async () => {
    // PrismaModule is global in the app; here it is imported with a fake client.
    const moduleRef = await Test.createTestingModule({
      imports: [PrismaModule, ProceduresModule],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();

    expect(moduleRef.get(ProceduresRepository)).toBeInstanceOf(
      PrismaProceduresRepository,
    );
    expect(moduleRef.get(ProcedureDraftService)).toBeInstanceOf(
      ProcedureDraftService,
    );
    expect(moduleRef.get(ProceduresController)).toBeInstanceOf(
      ProceduresController,
    );
  });
});
