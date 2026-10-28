import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';

// Configuración global de la app. La usan main.ts y los tests de integración,
// así los tests levantan la API igual que en producción.
export function configureApp(app: INestApplication): void {
  // Todas las rutas de la API comienzan con /api.
  app.setGlobalPrefix('api');

  // Parseo de cookies HTTP (ej. cookie httpOnly de refresh token).
  app.use(cookieParser());

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

  const document = SwaggerModule.createDocument(app, swaggerConfig);

  SwaggerModule.setup('docs', app, document, {
    useGlobalPrefix: true,
  });
}
