
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Todas las rutas de la API comienzan con /api.
  app.setGlobalPrefix('api');

  // Validación automática de los DTO.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Configuración de la documentación Swagger.
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Manual de Operaciones API')
    .setDescription('API del proyecto IntegrarTEC 2026')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(
    app,
    swaggerConfig,
  );

  SwaggerModule.setup('docs', app, document, {
    useGlobalPrefix: true,
  });

  await app.listen(process.env.PORT ?? 3000);
}

void bootstrap();
