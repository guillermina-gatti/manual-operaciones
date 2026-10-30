/* Arnés de integración de documentos: la app con la configuración de main.ts y simulaciones observables */

import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import { ACCESS_TOKEN_TTL_SECONDS } from '../../src/auth/auth.service';
import { PasswordService } from '../../src/auth/password.service';
import { Clock } from '../../src/common/clock';
import { AREA_IDS, FIXTURE_USERS } from '../../src/documents/adapters/fixtures';
import { FakeProcessingQueue } from '../../src/documents/adapters/fake-processing-queue';
import { LoggerAuditLog } from '../../src/documents/adapters/logger-audit-log';
import { AuditLog } from '../../src/documents/ports/audit-log';
import { ProcessingQueue } from '../../src/documents/ports/processing-queue';
import type { DirectoryUser } from '../../src/documents/ports/users-directory';
import { PrismaService } from '../../src/prisma/prisma.service';
import { FileStorage } from '../../src/storage/file-storage';
import { InMemoryFileStorage } from '../../src/storage/in-memory-file-storage';
import { seedDirectoryFixtures } from '../directory-fixtures';

export const TEST_FIXTURE_PASSWORD = 'TestOnly-FixturePass!2026';

const testJwtService = new JwtService();
const testPasswordService = new PasswordService();
let cachedFixturePasswordHashPromise: Promise<string> | null = null;

function resolveTestJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.trim().length === 0) {
    throw new Error(
      'Falta JWT_SECRET en el entorno de pruebas: debe coincidir con el secreto que consume JwtAuthGuard',
    );
  }
  return secret;
}

async function assertTestDatabaseConnected(
  prisma: PrismaService,
): Promise<void> {
  const activeUrl = process.env.DATABASE_URL;
  if (!activeUrl) {
    throw new Error(
      'Operación de fixtures abortada: DATABASE_URL no está configurada',
    );
  }

  const testUrl = process.env.TEST_DATABASE_URL;
  if (!testUrl || activeUrl !== testUrl) {
    throw new Error(
      'Operación de fixtures abortada: DATABASE_URL no coincide con TEST_DATABASE_URL',
    );
  }

  const { hostname, pathname } = new URL(activeUrl);
  const expectedDatabase = decodeURIComponent(pathname.replace(/^\//, ''));
  const isLocalHost = hostname === 'localhost' || hostname === '127.0.0.1';
  if (!isLocalHost || !expectedDatabase.endsWith('_test')) {
    throw new Error(
      `Operación de fixtures abortada: DATABASE_URL apunta a "${expectedDatabase}" en "${hostname}" (se requiere base local *_test)`,
    );
  }

  const rows = await prisma.$queryRawUnsafe<
    Array<{ current_database: string }>
  >('SELECT current_database()');
  const connectedDatabase = rows[0]?.current_database;
  if (
    !connectedDatabase ||
    !connectedDatabase.endsWith('_test') ||
    connectedDatabase !== expectedDatabase
  ) {
    throw new Error(
      `Operación de fixtures abortada: la instancia de Prisma está conectada a "${connectedDatabase ?? 'desconocida'}" (se esperaba "${expectedDatabase}")`,
    );
  }
}

export function getTestFixturePasswordHash(): Promise<string> {
  if (!cachedFixturePasswordHashPromise) {
    cachedFixturePasswordHashPromise = testPasswordService.hash(
      TEST_FIXTURE_PASSWORD,
    );
  }
  return cachedFixturePasswordHashPromise;
}

export interface DocumentsTestApp {
  app: INestApplication;
  prisma: PrismaService;
  storage: InMemoryFileStorage;
  queue: FakeProcessingQueue;
  audit: LoggerAuditLog;
}

// Un reloj de documentos que siempre da el mismo instante (spec 005, D2). Extiende el Clock de
// src/common/clock.ts, no el de las ejecuciones (D20).
export class FixedClock extends Clock {
  constructor(private readonly instant: Date) {
    super();
  }

  now(): Date {
    return new Date(this.instant);
  }
}

// Levanta AppModule entero. El almacenamiento, la cola y la auditoría se reemplazan por
// instancias propias del test, así se pueden revisar (y nunca se usa el bucket real).
// Prisma va contra la base de tests (test/setup-env.ts).
// Spec 005 (T11): con `clock`, "hoy" sale de ese reloj; sin él, de la hora real, como antes.
export async function createDocumentsTestApp(
  options: { clock?: Clock } = {},
): Promise<DocumentsTestApp> {
  const storage = new InMemoryFileStorage();
  const queue = new FakeProcessingQueue();
  const audit = new LoggerAuditLog();

  let builder = Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(FileStorage)
    .useValue(storage)
    .overrideProvider(ProcessingQueue)
    .useValue(queue)
    .overrideProvider(AuditLog)
    .useValue(audit);
  if (options.clock) {
    builder = builder.overrideProvider(Clock).useValue(options.clock);
  }
  const moduleRef = await builder.compile();

  const app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();

  // Desde A-04, AreasDirectory y UsersDirectory leen las tablas reales: sin estos registros no
  // existiría ningún área ni usuario de los fixtures. Una vez por suite (beforeAll); es idempotente.
  const prisma = app.get(PrismaService);
  await seedDirectoryFixtures(prisma);

  return { app, prisma, storage, queue, audit };
}

export async function cleanDocuments(prisma: PrismaService): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE document_versions, document_areas, documents CASCADE',
  );
}

const FIXTURE_AREAS_META = [
  {
    id: AREA_IDS.ventas,
    name: `Fixture Ventas (${AREA_IDS.ventas})`,
  },
  {
    id: AREA_IDS.operaciones,
    name: `Fixture Operaciones (${AREA_IDS.operaciones})`,
  },
] as const;

const FIXTURE_USERS_META: ReadonlyArray<{
  user: DirectoryUser;
  name: string;
  email: string;
}> = [
  {
    user: FIXTURE_USERS.admin,
    name: 'Admin Fixture',
    email: `fixture-${FIXTURE_USERS.admin.id}@fixtures.test.invalid`,
  },
  {
    user: FIXTURE_USERS.supervisorVentas,
    name: 'Supervisor Ventas Fixture',
    email: `fixture-${FIXTURE_USERS.supervisorVentas.id}@fixtures.test.invalid`,
  },
  {
    user: FIXTURE_USERS.empleadoVentas,
    name: 'Empleado Ventas Fixture',
    email: `fixture-${FIXTURE_USERS.empleadoVentas.id}@fixtures.test.invalid`,
  },
  {
    user: FIXTURE_USERS.supervisorOperaciones,
    name: 'Supervisor Operaciones Fixture',
    email: `fixture-${FIXTURE_USERS.supervisorOperaciones.id}@fixtures.test.invalid`,
  },
  {
    user: FIXTURE_USERS.empleadoOperaciones,
    name: 'Empleado Operaciones Fixture',
    email: `fixture-${FIXTURE_USERS.empleadoOperaciones.id}@fixtures.test.invalid`,
  },
];

// Prepara de forma idempotente las áreas, usuarios y asignaciones user_areas de fixtures en PostgreSQL.
// Separado de cleanDocuments() para no truncar tablas compartidas en cada test.
export async function seedFixtureDirectory(
  prisma: PrismaService,
): Promise<void> {
  await assertTestDatabaseConnected(prisma);
  const passwordHash = await getTestFixturePasswordHash();

  for (const area of FIXTURE_AREAS_META) {
    await prisma.area.upsert({
      where: { id: area.id },
      create: {
        id: area.id,
        name: area.name,
        isActive: true,
      },
      update: {
        name: area.name,
        isActive: true,
      },
    });
  }

  for (const entry of FIXTURE_USERS_META) {
    await prisma.user.upsert({
      where: { id: entry.user.id },
      create: {
        id: entry.user.id,
        name: entry.name,
        email: entry.email,
        passwordHash,
        role: entry.user.role,
        isActive: true,
      },
      update: {
        name: entry.name,
        email: entry.email,
        passwordHash,
        role: entry.user.role,
        isActive: true,
      },
    });
  }

  const fixtureUserIds = FIXTURE_USERS_META.map((entry) => entry.user.id);
  await prisma.userArea.deleteMany({
    where: { userId: { in: fixtureUserIds } },
  });

  const userAreaRows = FIXTURE_USERS_META.flatMap((entry) =>
    entry.user.areaIds.map((areaId) => ({
      userId: entry.user.id,
      areaId,
    })),
  );

  if (userAreaRows.length > 0) {
    await prisma.userArea.createMany({
      data: userAreaRows,
      skipDuplicates: true,
    });
  }
}

export interface SeededDocument {
  id: string;
  versionId: string;
  storageKey: string;
  originalFileName: string;
}

// Inserta directo en la base un documento con su primera versión (PENDING), con las áreas,
// el estado y la fecha de creación que elija el test. No pasa por la carga ni por el almacenamiento.
// Spec 005 (T06): `reviewDate` (YYYY-MM-DD), `ownerId` y `lastReview` opcionales. Sin ellos, como
// antes: 2027-01-15, responsable ADMIN y sin revisión. No pasa por canBeOwner: sirve para sembrar
// un responsable que perdió el acceso.
export async function seedDocument(
  prisma: PrismaService,
  opts: {
    areaIds: string[];
    status?: 'ACTIVE' | 'ARCHIVED';
    createdAt?: Date;
    title?: string;
    description?: string;
    checksum?: string;
    reviewDate?: string;
    ownerId?: string;
    lastReview?: { at: Date; byId: string };
  },
): Promise<SeededDocument> {
  const id = randomUUID();
  const versionId = randomUUID();
  const storageKey = `documents/${id}/${versionId}.pdf`;
  const originalFileName = `${opts.title ?? 'documento'}.pdf`;
  await prisma.document.create({
    data: {
      id,
      title: opts.title ?? 'Documento',
      description: opts.description ?? null,
      status: opts.status ?? 'ACTIVE',
      ownerId: opts.ownerId ?? FIXTURE_USERS.admin.id,
      reviewDate: new Date(opts.reviewDate ?? '2027-01-15'),
      createdById: FIXTURE_USERS.admin.id,
      ...(opts.createdAt && { createdAt: opts.createdAt }),
      ...(opts.lastReview && {
        lastReviewedAt: opts.lastReview.at,
        lastReviewedById: opts.lastReview.byId,
      }),
      areas: {
        createMany: { data: opts.areaIds.map((areaId) => ({ areaId })) },
      },
      versions: {
        create: {
          id: versionId,
          versionNumber: 1,
          storageKey,
          originalFileName,
          mimeType: 'application/pdf',
          sizeBytes: 1024,
          checksum:
            opts.checksum ?? randomUUID().replace(/-/g, '').padEnd(64, '0'),
          uploadedById: FIXTURE_USERS.admin.id,
        },
      },
    },
  });
  return { id, versionId, storageKey, originalFileName };
}

// Genera de forma sincrónica un JWT real firmado con JWT_SECRET para el guard de producción (JwtAuthGuard).
export const authHeaders = (user: Pick<DirectoryUser, 'id' | 'role'>) => ({
  Authorization: `Bearer ${testJwtService.sign(
    { sub: user.id, role: user.role },
    { secret: resolveTestJwtSecret(), expiresIn: ACCESS_TOKEN_TTL_SECONDS },
  )}`,
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

// Spec 003: simula lo que hará el worker de Guille cuando exista (plan 003, 3.4). Deja la versión
// en READY e inserta sus fragmentos con las áreas indicadas y activos o no. Sin embeddings: los
// tests del ciclo de vida solo miran area_ids e is_active.
// Spec 004 (T06): `contents` da el texto de cada fragmento (y su cantidad) y `pageNumbers`, su página.
// Sin ellos, los fragmentos son "Fragmento N de prueba", sin página, como antes.
export async function seedProcessedVersion(
  prisma: PrismaService,
  opts: {
    documentId: string;
    versionId: string;
    areaIds: string[];
    chunks?: number;
    isActive?: boolean;
    contents?: string[];
    pageNumbers?: (number | null)[];
  },
): Promise<string[]> {
  await prisma.documentVersion.update({
    where: { id: opts.versionId },
    data: { processingStatus: 'READY', processedAt: new Date() },
  });
  const count = opts.contents?.length ?? opts.chunks ?? 2;
  const ids = Array.from({ length: count }, () => randomUUID());
  await prisma.chunk.createMany({
    data: ids.map((id, chunkIndex) => ({
      id,
      documentVersionId: opts.versionId,
      documentId: opts.documentId,
      chunkIndex,
      content:
        opts.contents?.[chunkIndex] ?? `Fragmento ${chunkIndex + 1} de prueba`,
      pageNumber: opts.pageNumbers?.[chunkIndex] ?? null,
      areaIds: opts.areaIds,
      isActive: opts.isActive ?? true,
    })),
  });
  return ids;
}

// Spec 007 (T04, D10): deja una versión en el estado de procesamiento que pida el test, sin pasar
// por el worker. Sirve para sembrar una versión vigente en error (processingFailed).
export async function setProcessingStatus(
  prisma: PrismaService,
  versionId: string,
  status: 'PENDING' | 'PROCESSING' | 'READY' | 'FAILED',
): Promise<void> {
  await prisma.documentVersion.update({
    where: { id: versionId },
    data: {
      processingStatus: status,
      processingError: status === 'FAILED' ? 'Error de prueba' : null,
    },
  });
}
