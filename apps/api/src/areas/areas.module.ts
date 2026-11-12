import { Module } from '@nestjs/common';
import { AreasController } from './areas.controller';
import { AreasService } from './areas.service';

// PrismaService y JwtAuthGuard son provistos por los módulos globales existentes.
@Module({
  controllers: [AreasController],
  providers: [AreasService],
})
export class AreasModule {}
