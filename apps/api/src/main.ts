import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Cierre ordenado de conexiones (onModuleDestroy) ante señales SIGINT y SIGTERM.
  app.enableShutdownHooks();

  // Prefijo /api, ValidationPipe y Swagger (src/app.setup.ts).
  configureApp(app);

  await app.listen(process.env.PORT ?? 3000);
}

void bootstrap();
