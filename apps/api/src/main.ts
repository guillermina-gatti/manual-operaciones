import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Cierre ordenado de conexiones (onModuleDestroy) ante señales SIGINT y SIGTERM.
  app.enableShutdownHooks();

  // Política de proxy/cabeceras, prefijo /api, ValidationPipe y Swagger.
  configureApp(app);

  await app.listen(process.env.PORT ?? 3000);
}

void bootstrap();
