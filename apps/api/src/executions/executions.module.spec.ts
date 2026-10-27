import { Test } from '@nestjs/testing';
import { UsersDirectory } from '../documents/ports/users-directory';
import { PrismaUsersDirectory } from '../documents/adapters/prisma-users-directory';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import { InMemoryProceduresCatalog } from './adapters/in-memory-procedures-catalog';
import { ExecutionService } from './execution.service';
import { ExecutionsController } from './executions.controller';
import { ExecutionsModule } from './executions.module';
import { ExecutionsRepository } from './executions.repository';
import { ExecutionMetricsRepository } from './metrics/execution-metrics.repository';
import { PrismaExecutionMetricsRepository } from './metrics/prisma-execution-metrics.repository';
import { ProcedureMetricsController } from './metrics/procedure-metrics.controller';
import { ProcedureMetricsService } from './metrics/procedure-metrics.service';
import { Clock, SystemClock } from './ports/clock';
import { ProceduresCatalog } from './ports/procedures-catalog';
import { PrismaExecutionsRepository } from './prisma-executions.repository';

describe('ExecutionsModule', () => {
  it('wires each port to its adapter', async () => {
    // PrismaModule is global in the app; here it is imported with a fake client.
    const moduleRef = await Test.createTestingModule({
      imports: [PrismaModule, ExecutionsModule],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();

    expect(moduleRef.get(ProceduresCatalog)).toBeInstanceOf(
      InMemoryProceduresCatalog,
    );
    expect(moduleRef.get(UsersDirectory)).toBeInstanceOf(PrismaUsersDirectory);
    expect(moduleRef.get(ExecutionsRepository)).toBeInstanceOf(
      PrismaExecutionsRepository,
    );
    expect(moduleRef.get(Clock)).toBeInstanceOf(SystemClock);
    expect(moduleRef.get(ExecutionService)).toBeInstanceOf(ExecutionService);
    expect(moduleRef.get(ExecutionsController)).toBeInstanceOf(
      ExecutionsController,
    );
  });

  it('wires the procedures metrics (HU38)', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PrismaModule, ExecutionsModule],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();

    expect(moduleRef.get(ExecutionMetricsRepository)).toBeInstanceOf(
      PrismaExecutionMetricsRepository,
    );
    expect(moduleRef.get(ProcedureMetricsService)).toBeInstanceOf(
      ProcedureMetricsService,
    );
    expect(moduleRef.get(ProcedureMetricsController)).toBeInstanceOf(
      ProcedureMetricsController,
    );
  });
});
