import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import {
  configureHttpAdapter,
  resolveHttpSecurityPolicy,
} from './http-security';

type Environment = Record<string, unknown>;

// Configuración global de la app. La usan main.ts y los tests de integración,
// así los tests levantan la API igual que en producción.
export function configureApp(
  app: INestApplication,
  environment: Environment = process.env,
): void {
  const httpPolicy = resolveHttpSecurityPolicy(environment);
  configureHttpAdapter(app, httpPolicy);

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

  // En producción Swagger requiere opt-in explícito; desarrollo conserva /api/docs.
  if (!httpPolicy.swaggerEnabled) return;

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
