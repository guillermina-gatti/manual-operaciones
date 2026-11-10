import { Test } from '@nestjs/testing';
import { JwtAuthGuard } from '../common/auth';
import { PrismaAreasDirectory } from '../documents/adapters/prisma-areas-directory';
import { PrismaUsersDirectory } from '../documents/adapters/prisma-users-directory';
import { AreasDirectory } from '../documents/ports/areas-directory';
import { UsersDirectory } from '../documents/ports/users-directory';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import { ProcedureAreasService } from './procedure-areas.service';
import { ProcedureDraftService } from './procedure-draft.service';
import { ProcedureHistoryService } from './procedure-history.service';
import { ProcedurePublishService } from './procedure-publish.service';
import { ProcedureVersionsController } from './procedure-versions.controller';
import { PrismaProceduresRepository } from './prisma-procedures.repository';
import { PrismaPublishRepository } from './prisma-publish.repository';
import { PrismaVersionsRepository } from './prisma-versions.repository';
import { ProceduresController } from './procedures.controller';
import { ProceduresModule } from './procedures.module';
import { ProceduresRepository } from './procedures.repository';
import { PublishRepository } from './publish.repository';
import { VersionsRepository } from './versions.repository';

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

  it('spec 015: wires the publish and versions repositories, the users directory and the versions controller', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PrismaModule, ProceduresModule],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    expect(moduleRef.get(PublishRepository)).toBeInstanceOf(PrismaPublishRepository);
    expect(moduleRef.get(VersionsRepository)).toBeInstanceOf(PrismaVersionsRepository);
    expect(moduleRef.get(UsersDirectory)).toBeInstanceOf(PrismaUsersDirectory);
    expect(moduleRef.get(ProcedurePublishService)).toBeInstanceOf(ProcedurePublishService);
    expect(moduleRef.get(ProcedureHistoryService)).toBeInstanceOf(ProcedureHistoryService);
    expect(moduleRef.get(ProcedureVersionsController)).toBeInstanceOf(ProcedureVersionsController);
  });
});
