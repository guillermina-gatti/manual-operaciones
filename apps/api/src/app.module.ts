// Módulo raíz de la aplicación que configura los módulos globales, la base de datos y los submódulos de negocio.
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DocumentsModule } from './documents/documents.module';
import { ExecutionsModule } from './executions/executions.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProceduresModule } from './procedures/procedures.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    DocumentsModule,
    ExecutionsModule,
    ProceduresModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
