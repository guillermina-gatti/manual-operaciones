/* PrismaDocumentsRepository contra la base de tests (T18) */

import { randomUUID } from 'node:crypto';
import { connect, createServer } from 'node:net';
import type { AddressInfo, Socket } from 'node:net';
import { AREA_IDS, FIXTURE_USERS } from '../../src/documents/adapters/fixtures';
import {
  NewDocument,
  RepositoryUnavailableError,
} from '../../src/documents/documents.repository';
import { PrismaDocumentsRepository } from '../../src/documents/prisma-documents.repository';
import { Prisma } from '../../src/generated/prisma/client';
import { PrismaService } from '../../src/prisma/prisma.service';

const CHECKSUM_A = 'a'.repeat(64);
const CHECKSUM_B = 'b'.repeat(64);

function newDocument(overrides: Partial<NewDocument> = {}): NewDocument {
  const id = randomUUID();
  const versionId = randomUUID();
  return {
    id,
    title: 'Procedimiento de caja',
    description: 'Cierre diario',
    areaIds: [AREA_IDS.ventas],
    ownerId: FIXTURE_USERS.supervisorVentas.id,
    reviewDate: new Date('2027-01-15'),
    createdById: FIXTURE_USERS.admin.id,
    version: {
      id: versionId,
      storageKey: `documents/${id}/${versionId}.pdf`,
      originalFileName: 'Procedimiento de caja.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1234,
      checksum: CHECKSUM_A,
      uploadedById: FIXTURE_USERS.admin.id,
    },
    ...overrides,
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('PrismaDocumentsRepository (integración)', () => {
  let prisma: PrismaService;
  let repository: PrismaDocumentsRepository;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    repository = new PrismaDocumentsRepository(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(
      'TRUNCATE document_versions, document_areas, documents CASCADE',
    );
  });

  async function create(data: NewDocument) {
    return repository.runInTransaction((tx) =>
      repository.createWithFirstVersion(tx, data),
    );
  }

  // Inserta directo, con createdAt y status elegidos por el test.
  async function insert(opts: {
    id?: string;
    createdAt: Date;
    status?: 'ACTIVE' | 'ARCHIVED';
    areaIds?: string[];
    checksum?: string;
  }) {
    const id = opts.id ?? randomUUID();
    const versionId = randomUUID();
    await prisma.document.create({
      data: {
        id,
        title: `Doc ${id}`,
        status: opts.status ?? 'ACTIVE',
        ownerId: FIXTURE_USERS.supervisorVentas.id,
        reviewDate: new Date('2027-01-15'),
        createdById: FIXTURE_USERS.admin.id,
        createdAt: opts.createdAt,
        areas: {
          createMany: {
            data: (opts.areaIds ?? [AREA_IDS.ventas]).map((areaId) => ({
              areaId,
            })),
          },
        },
        versions: {
          create: {
            id: versionId,
            versionNumber: 1,
            storageKey: `documents/${id}/${versionId}.pdf`,
            originalFileName: 'x.pdf',
            mimeType: 'application/pdf',
            sizeBytes: 1,
            checksum: opts.checksum ?? CHECKSUM_B,
            uploadedById: FIXTURE_USERS.admin.id,
          },
        },
      },
    });
    return id;
  }

  describe('createWithFirstVersion', () => {
    it('deja las filas de plan 2.3 y devuelve el registro', async () => {
      const data = newDocument({
        areaIds: [AREA_IDS.ventas, AREA_IDS.operaciones, AREA_IDS.ventas],
      });

      const record = await create(data);

      const doc = await prisma.document.findUniqueOrThrow({
        where: { id: data.id },
        include: { areas: true, versions: true },
      });
      expect(doc).toMatchObject({
        title: data.title,
        description: data.description,
        status: 'ACTIVE',
        ownerId: data.ownerId,
        reviewDate: data.reviewDate,
        createdById: data.createdById,
      });
      expect(doc.areas.map((a) => a.areaId).sort()).toEqual(
        [AREA_IDS.ventas, AREA_IDS.operaciones].sort(),
      );
      expect(doc.versions).toHaveLength(1);
      expect(doc.versions[0]).toMatchObject({
        ...data.version,
        versionNumber: 1,
        status: 'CURRENT',
        processingStatus: 'PENDING',
      });

      expect(record).toMatchObject({
        id: data.id,
        status: 'ACTIVE',
        currentVersion: {
          id: data.version.id,
          versionNumber: 1,
          status: 'CURRENT',
          processingStatus: 'PENDING',
          checksum: CHECKSUM_A,
        },
      });
      expect(record.areaIds.sort()).toEqual(
        [AREA_IDS.ventas, AREA_IDS.operaciones].sort(),
      );
    });

    it('una violación de unicidad se propaga sin traducir', async () => {
      const first = newDocument();
      await create(first);
      const second = newDocument();
      second.version.storageKey = first.version.storageKey;

      const error: unknown = await create(second).catch((e: unknown) => e);

      expect(error).not.toBeInstanceOf(RepositoryUnavailableError);
      expect(error).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
      expect((error as Prisma.PrismaClientKnownRequestError).code).toBe(
        'P2002',
      );
    });
  });

  describe('findActiveByChecksum', () => {
    it('encuentra la versión vigente de un documento ACTIVE', async () => {
      const data = newDocument();
      await create(data);

      await expect(repository.findActiveByChecksum(CHECKSUM_A)).resolves.toEqual(
        { documentId: data.id },
      );
    });

    it('devuelve null si el documento está ARCHIVED (R8b)', async () => {
      await insert({
        createdAt: new Date(),
        status: 'ARCHIVED',
        checksum: CHECKSUM_A,
      });

      await expect(
        repository.findActiveByChecksum(CHECKSUM_A),
      ).resolves.toBeNull();
    });

    it('devuelve null si no hay ninguno', async () => {
      await expect(
        repository.findActiveByChecksum(CHECKSUM_A),
      ).resolves.toBeNull();
    });
  });

  describe('list', () => {
    it('ordena del más nuevo al más viejo y desempata por id (R13)', async () => {
      const same = new Date('2026-10-01T12:00:00Z');
      const oldest = await insert({ createdAt: new Date('2026-09-01T12:00:00Z') });
      const tieLow = await insert({
        id: '00000000-0000-4000-8000-000000000001',
        createdAt: same,
      });
      const tieHigh = await insert({
        id: 'ffffffff-0000-4000-8000-000000000001',
        createdAt: same,
      });
      const newest = await insert({ createdAt: new Date('2026-10-20T12:00:00Z') });

      const page = await repository.list({}, 1, 10);

      expect(page.data.map((d) => d.id)).toEqual([
        newest,
        tieHigh,
        tieLow,
        oldest,
      ]);
      expect(page.total).toBe(4);
    });

    it('pagina y el total respeta el where', async () => {
      const ventas = [];
      for (let day = 1; day <= 3; day++) {
        ventas.push(
          await insert({
            createdAt: new Date(`2026-10-0${day}T12:00:00Z`),
            areaIds: [AREA_IDS.ventas],
          }),
        );
      }
      await insert({
        createdAt: new Date('2026-10-05T12:00:00Z'),
        areaIds: [AREA_IDS.operaciones],
      });
      const where: Prisma.DocumentWhereInput = {
        areas: { some: { areaId: { in: [AREA_IDS.ventas] } } },
      };

      const page2 = await repository.list(where, 2, 2);

      expect(page2.total).toBe(3);
      expect(page2.data.map((d) => d.id)).toEqual([ventas[0]]);
      expect(page2.data[0].areaIds).toEqual([AREA_IDS.ventas]);
      expect(page2.data[0].currentVersion.status).toBe('CURRENT');
    });
  });

  describe('findByIdWithAreas', () => {
    it('devuelve el documento con sus áreas y su versión vigente', async () => {
      const data = newDocument();
      await create(data);

      const record = await repository.findByIdWithAreas(data.id);

      expect(record).toMatchObject({
        id: data.id,
        areaIds: [AREA_IDS.ventas],
        currentVersion: {
          id: data.version.id,
          storageKey: data.version.storageKey,
          originalFileName: data.version.originalFileName,
        },
      });
    });

    it('devuelve null si no existe', async () => {
      await expect(
        repository.findByIdWithAreas(randomUUID()),
      ).resolves.toBeNull();
    });
  });

  describe('runInTransaction', () => {
    it('si fn lanza, no queda ninguna fila (R7)', async () => {
      const failure = new Error('falló el encolado');

      await expect(
        repository.runInTransaction(async (tx) => {
          await repository.createWithFirstVersion(tx, newDocument());
          throw failure;
        }),
      ).rejects.toBe(failure);

      expect(await prisma.document.count()).toBe(0);
      expect(await prisma.documentArea.count()).toBe(0);
      expect(await prisma.documentVersion.count()).toBe(0);
    });

    it('si supera el timeout, rechaza con RepositoryUnavailableError y no deja filas', async () => {
      await expect(
        repository.runInTransaction(async (tx) => {
          await repository.createWithFirstVersion(tx, newDocument());
          await sleep(6000);
        }),
      ).rejects.toBeInstanceOf(RepositoryUnavailableError);

      expect(await prisma.document.count()).toBe(0);
    }, 15000);
  });

  describe('base inalcanzable', () => {
    let unreachable: PrismaService;
    let savedUrl: string | undefined;

    beforeAll(() => {
      savedUrl = process.env.DATABASE_URL;
      process.env.DATABASE_URL =
        'postgresql://app:app@127.0.0.1:1/manual_test?connect_timeout=2';
      unreachable = new PrismaService();
      process.env.DATABASE_URL = savedUrl;
    });

    afterAll(async () => {
      await unreachable.$disconnect();
    });

    it('una consulta rechaza con RepositoryUnavailableError', async () => {
      const repo = new PrismaDocumentsRepository(unreachable);

      await expect(
        repo.findActiveByChecksum(CHECKSUM_A),
      ).rejects.toBeInstanceOf(RepositoryUnavailableError);
    }, 15000);

    it('una transacción rechaza con RepositoryUnavailableError', async () => {
      const repo = new PrismaDocumentsRepository(unreachable);

      await expect(
        repo.runInTransaction(async () => 'nunca llega'),
      ).rejects.toBeInstanceOf(RepositoryUnavailableError);
    }, 15000);
  });

  // El servidor responde pero rechaza el usuario o la contraseña: pasa si DATABASE_URL apunta a otro
  // PostgreSQL en el mismo puerto (por ejemplo, uno de WSL con el Docker apagado).
  describe('credenciales rechazadas', () => {
    it.each([
      ['contraseña incorrecta', { password: 'no-es-la-clave' }],
      ['usuario inexistente', { username: 'usuario_que_no_existe' }],
    ])(
      '%s: una consulta y una transacción rechazan con RepositoryUnavailableError (%s)',
      async (_case, credentials) => {
        const client = clientWith(withCredentials(testUrl(), credentials));
        const repo = new PrismaDocumentsRepository(client);
        try {
          const queryError = await errorOf(repo.findActiveByChecksum(CHECKSUM_A));
          const transactionError = await errorOf(repo.runInTransaction(async () => 'nunca llega'));

          expect(queryError).toBeInstanceOf(RepositoryUnavailableError);
          expect(transactionError).toBeInstanceOf(RepositoryUnavailableError);
          expect(codeOf(queryError)).toBe('P1000');
          expect(codeOf(transactionError)).toBe('P1000');
        } finally {
          await client.$disconnect();
        }
      },
      15000,
    );
  });

  // La API ya estaba conectada y la base se cae: las conexiones abiertas se cortan y las nuevas se
  // rechazan. Se simula con un intermediario TCP entre Prisma y PostgreSQL, sin tocar Docker.
  describe('la base se cae con la API ya conectada', () => {
    let proxy: TcpProxy;
    let client: PrismaService;
    let repo: PrismaDocumentsRepository;

    beforeEach(async () => {
      proxy = await startTcpProxy(new URL(testUrl()));
      client = clientWith(throughProxy(testUrl(), proxy.port));
      repo = new PrismaDocumentsRepository(client);
      // Conectada y funcionando antes del corte.
      await expect(repo.findActiveByChecksum(CHECKSUM_A)).resolves.toBeNull();
    });

    afterEach(async () => {
      await proxy.close();
      await client.$disconnect();
    });

    it('una consulta después del corte rechaza con RepositoryUnavailableError', async () => {
      await proxy.close();

      const error = await errorOf(repo.findActiveByChecksum(CHECKSUM_A));

      expect(error).toBeInstanceOf(RepositoryUnavailableError);
      expect(codeOf(error)).toBe('P1017');
    }, 15000);

    it('una transacción en curso cuando se corta rechaza con RepositoryUnavailableError', async () => {
      const running = errorOf(
        repo.runInTransaction(async (tx) => {
          await (tx as unknown as Prisma.TransactionClient).$executeRawUnsafe(
            'SELECT pg_sleep(3)',
          );
        }),
      );
      await sleep(300);
      await proxy.close();

      const error = await running;

      expect(error).toBeInstanceOf(RepositoryUnavailableError);
      // No es un error de Prisma: el adaptador de pg deja pasar este error del driver, que no trae código.
      expect(codeOf(error)).toBe('Error: Connection terminated unexpectedly');
    }, 15000);
  });
});

// ---- Ayudas para simular fallas de la base ----

const testUrl = () => process.env.DATABASE_URL as string;

function withCredentials(url: string, credentials: { username?: string; password?: string }) {
  const parsed = new URL(url);
  if (credentials.username) parsed.username = credentials.username;
  if (credentials.password) parsed.password = credentials.password;
  return parsed.toString();
}

function throughProxy(url: string, port: number) {
  const parsed = new URL(url);
  parsed.hostname = '127.0.0.1';
  parsed.port = String(port);
  return parsed.toString();
}

// PrismaService lee DATABASE_URL en el constructor: se cambia solo mientras se crea.
function clientWith(url: string): PrismaService {
  const saved = process.env.DATABASE_URL;
  process.env.DATABASE_URL = url;
  try {
    return new PrismaService();
  } finally {
    process.env.DATABASE_URL = saved;
  }
}

async function errorOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('La operación no falló');
}

// El código de Prisma del error original (el que se tradujo o no).
function codeOf(error: unknown): string {
  const original = error instanceof RepositoryUnavailableError ? error.cause : error;
  if (original && typeof original === 'object' && 'code' in original) {
    return String((original as { code: unknown }).code);
  }
  return original instanceof Error ? `${original.name}: ${original.message}` : String(original);
}

interface TcpProxy {
  port: number;
  close(): Promise<void>;
}

// Pasa los bytes entre Prisma y PostgreSQL. close() corta las conexiones abiertas
// y deja de escuchar: las conexiones nuevas se rechazan (ECONNREFUSED).
async function startTcpProxy(target: URL): Promise<TcpProxy> {
  const sockets = new Set<Socket>();
  const server = createServer((incoming) => {
    const upstream = connect(Number(target.port || 5432), target.hostname);
    for (const socket of [incoming, upstream]) {
      sockets.add(socket);
      socket.on('error', () => undefined);
      socket.on('close', () => {
        sockets.delete(socket);
        incoming.destroy();
        upstream.destroy();
      });
    }
    incoming.pipe(upstream);
    upstream.pipe(incoming);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  let closed = false;

  return {
    port: (server.address() as AddressInfo).port,
    close: () => {
      if (closed) return Promise.resolve();
      closed = true;
      for (const socket of sockets) socket.destroy();
      return new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
