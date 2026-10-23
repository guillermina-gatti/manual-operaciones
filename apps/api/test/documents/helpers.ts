/* Arnés de integración de documentos: la app con la configuración de main.ts y simulaciones observables */

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import { FakeProcessingQueue } from '../../src/documents/adapters/fake-processing-queue';
import { LoggerAuditLog } from '../../src/documents/adapters/logger-audit-log';
import { AuditLog } from '../../src/documents/ports/audit-log';
import { ProcessingQueue } from '../../src/documents/ports/processing-queue';
import { PrismaService } from '../../src/prisma/prisma.service';
import { FileStorage } from '../../src/storage/file-storage';
import { InMemoryFileStorage } from '../../src/storage/in-memory-file-storage';
import type { DirectoryUser } from '../../src/documents/ports/users-directory';

export interface DocumentsTestApp {
  app: INestApplication;
  prisma: PrismaService;
  storage: InMemoryFileStorage;
  queue: FakeProcessingQueue;
  audit: LoggerAuditLog;
}

// Levanta AppModule entero. El almacenamiento, la cola y la auditoría se reemplazan por
// instancias propias del test, así se pueden revisar (y nunca se usa el bucket real).
// Prisma va contra la base de tests (test/setup-env.ts).
export async function createDocumentsTestApp(): Promise<DocumentsTestApp> {
  const storage = new InMemoryFileStorage();
  const queue = new FakeProcessingQueue();
  const audit = new LoggerAuditLog();

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(FileStorage)
    .useValue(storage)
    .overrideProvider(ProcessingQueue)
    .useValue(queue)
    .overrideProvider(AuditLog)
    .useValue(audit)
    .compile();

  const app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();

  return { app, prisma: app.get(PrismaService), storage, queue, audit };
}

export async function cleanDocuments(prisma: PrismaService): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE document_versions, document_areas, documents CASCADE',
  );
}

// Cabeceras que lee el JwtAuthGuard simulado (src/common/auth). Cuando llegue la
// autenticación real, este es el único lugar que cambia (overrideGuard).
export const authHeaders = (user: Pick<DirectoryUser, 'id' | 'role'>) => ({
  'x-user-id': user.id,
  'x-user-role': user.role,
});

// PDF del tamaño pedido: la firma %PDF- y relleno.
export function pdfOfSize(bytes: number): Buffer {
  const buffer = Buffer.alloc(bytes, 0x20);
  buffer.write('%PDF-1.4\n', 0, 'ascii');
  return buffer;
}

// Fecha YYYY-MM-DD a `days` días de hoy (R6 pide una fecha posterior a hoy).
export const daysFromToday = (days: number) =>
  new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
