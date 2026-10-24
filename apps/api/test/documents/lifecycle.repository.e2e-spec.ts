/* PrismaDocumentsRepository: bloqueo y cambio de áreas, contra la base de tests (spec 003, T06) */

import { randomUUID } from 'node:crypto';
import { AREA_IDS, FIXTURE_USERS } from '../../src/documents/adapters/fixtures';
import { ConcurrentVersionError } from '../../src/documents/documents.repository';
import type {
  NewVersion,
  RepositoryTransaction,
} from '../../src/documents/documents.repository';
import { PrismaDocumentsRepository } from '../../src/documents/prisma-documents.repository';
import { Prisma } from '../../src/generated/prisma/client';
import { PrismaService } from '../../src/prisma/prisma.service';
import { cleanDocuments, seedDocument, seedProcessedVersion } from './helpers';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Una promesa que el test resuelve cuando quiere, para ordenar dos transacciones.
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

// Espera la señal de la transacción A; si A termina antes (por ejemplo, porque lockForUpdate falló),
// falla enseguida con el error de A en vez de esperar al tiempo límite del test.
async function untilSignalOrFailure(signal: Promise<void>, transaction: Promise<unknown>) {
  await Promise.race([
    signal,
    transaction.then(() => {
      throw new Error('La transacción A terminó antes de dar la señal');
    }),
  ]);
}

// La transacción es opaca para los servicios; el test la usa como cliente de Prisma para escribir a mano.
const asClient = (tx: RepositoryTransaction) =>
  tx as unknown as Prisma.TransactionClient;

// Pasa la versión vigente a REPLACED y crea otra CURRENT, con SQL dentro de la transacción recibida.
// addVersion llega en T07: acá se hace a mano para preparar los datos.
async function replaceCurrentVersion(
  client: Prisma.TransactionClient | PrismaService,
  documentId: string,
  versionNumber: number,
  checksum: string,
): Promise<string> {
  const id = randomUUID();
  await client.$executeRaw`
    UPDATE document_versions SET status = 'REPLACED'
    WHERE document_id = ${documentId}::uuid AND status = 'CURRENT'
  `;
  await client.$executeRaw`
    INSERT INTO document_versions
      (id, document_id, version_number, status, storage_key, original_file_name,
       mime_type, size_bytes, checksum, uploaded_by_id)
    VALUES
      (${id}::uuid, ${documentId}::uuid, ${versionNumber}, 'CURRENT',
       ${`documents/${documentId}/${id}.pdf`}, ${`version-${versionNumber}.pdf`},
       'application/pdf', 2048, ${checksum}, ${FIXTURE_USERS.admin.id}::uuid)
  `;
  return id;
}

// Los datos de una versión nueva, como los armará el servicio de T11: clave única y checksum propio.
function newVersion(documentId: string, checksum: string): NewVersion {
  const id = randomUUID();
  return {
    id,
    storageKey: `documents/${documentId}/${id}.pdf`,
    originalFileName: 'manual-v-nueva.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 4096,
    checksum,
    uploadedById: FIXTURE_USERS.admin.id,
  };
}

describe('PrismaDocumentsRepository: ciclo de vida (integración, T06 y T07)', () => {
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
    await cleanDocuments(prisma);
  });

  describe('lockForUpdate', () => {
    it('devuelve el documento con sus áreas y su versión vigente, con el checksum', async () => {
      const checksum = 'a'.repeat(64);
      const seeded = await seedDocument(prisma, {
        areaIds: [AREA_IDS.ventas, AREA_IDS.operaciones],
        checksum,
      });

      const locked = await repository.runInTransaction((tx) =>
        repository.lockForUpdate(tx, seeded.id),
      );

      expect(locked).not.toBeNull();
      expect(locked!.id).toBe(seeded.id);
      expect([...locked!.areaIds].sort()).toEqual(
        [AREA_IDS.ventas, AREA_IDS.operaciones].sort(),
      );
      expect(locked!.currentVersion).toMatchObject({
        id: seeded.versionId,
        versionNumber: 1,
        status: 'CURRENT',
        checksum,
      });
    });

    it('un id que no existe da null', async () => {
      const locked = await repository.runInTransaction((tx) =>
        repository.lockForUpdate(tx, randomUUID()),
      );

      expect(locked).toBeNull();
    });

    it('mientras una transacción tiene el bloqueo, otra que pide el mismo documento espera hasta el commit', async () => {
      const seeded = await seedDocument(prisma, { areaIds: [AREA_IDS.ventas] });
      const aLocked = deferred();
      const releaseA = deferred();
      let aCommittedAt = 0;
      let bLockedAt = 0;

      const a = repository
        .runInTransaction(async (tx) => {
          await repository.lockForUpdate(tx, seeded.id);
          aLocked.resolve();
          await releaseA.promise;
        })
        .then(() => {
          aCommittedAt = Date.now();
        });

      await untilSignalOrFailure(aLocked.promise, a);
      const b = repository.runInTransaction(async (tx) => {
        await repository.lockForUpdate(tx, seeded.id);
        bLockedAt = Date.now();
      });

      // B no puede obtener el bloqueo mientras A no confirme.
      await sleep(400);
      expect(bLockedAt).toBe(0);

      releaseA.resolve();
      await Promise.all([a, b]);

      expect(bLockedAt).toBeGreaterThanOrEqual(aCommittedAt);
    }, 15000);

    // Plan 003, 3.3 y T06: la lectura va DESPUÉS del bloqueo, en otra sentencia. Si fuera una sola
    // (FOR UPDATE con JOIN), B podría leer todavía la v1 y dejar pasar un archivo idéntico (R6b)
    // o crear una versión sobre la equivocada (R8).
    it('la lectura después del bloqueo ve la versión que confirmó la otra transacción (A y B)', async () => {
      const v1Checksum = '1'.repeat(64);
      const v2Checksum = '2'.repeat(64);
      const seeded = await seedDocument(prisma, {
        areaIds: [AREA_IDS.ventas],
        checksum: v1Checksum,
      });
      const aWrote = deferred();
      const releaseA = deferred();
      let v2Id = '';

      // 1. A bloquea y crea la v2 dentro de su transacción, sin confirmar.
      const a = repository.runInTransaction(async (tx) => {
        await repository.lockForUpdate(tx, seeded.id);
        v2Id = await replaceCurrentVersion(asClient(tx), seeded.id, 2, v2Checksum);
        aWrote.resolve();
        await releaseA.promise;
      });

      await untilSignalOrFailure(aWrote.promise, a);

      // 2. B pide el mismo documento: queda esperando el bloqueo.
      const b = repository.runInTransaction((tx) =>
        repository.lockForUpdate(tx, seeded.id),
      );
      await sleep(400);

      // 3. A confirma.
      releaseA.resolve();
      await a;

      // 4. B obtiene el bloqueo y ve la v2.
      const seenByB = await b;
      expect(seenByB!.currentVersion).toMatchObject({
        id: v2Id,
        versionNumber: 2,
        status: 'CURRENT',
        checksum: v2Checksum,
      });
    }, 15000);
  });

  describe('replaceAreas (R5)', () => {
    it('reemplaza document_areas y copia las áreas nuevas a los fragmentos de TODAS las versiones', async () => {
      const seeded = await seedDocument(prisma, { areaIds: [AREA_IDS.ventas] });
      // v1 procesada y después reemplazada por v2, también procesada.
      await seedProcessedVersion(prisma, {
        documentId: seeded.id,
        versionId: seeded.versionId,
        areaIds: [AREA_IDS.ventas],
        isActive: false,
      });
      const v2Id = await replaceCurrentVersion(prisma, seeded.id, 2, 'b'.repeat(64));
      await seedProcessedVersion(prisma, {
        documentId: seeded.id,
        versionId: v2Id,
        areaIds: [AREA_IDS.ventas],
      });

      const updated = await repository.runInTransaction((tx) =>
        repository.replaceAreas(tx, seeded.id, [AREA_IDS.operaciones]),
      );

      expect(updated.areaIds).toEqual([AREA_IDS.operaciones]);
      const areas = await prisma.documentArea.findMany({
        where: { documentId: seeded.id },
      });
      expect(areas.map((area) => area.areaId)).toEqual([AREA_IDS.operaciones]);

      const chunks = await prisma.chunk.findMany({
        where: { documentId: seeded.id },
        select: { documentVersionId: true, areaIds: true, isActive: true },
      });
      expect(chunks).toHaveLength(4);
      for (const chunk of chunks) {
        expect(chunk.areaIds).toEqual([AREA_IDS.operaciones]);
      }
      // Cambiar áreas no toca is_active: la v1 sigue inactiva y la v2 activa.
      expect(
        chunks.filter((c) => c.documentVersionId === seeded.versionId).every((c) => !c.isActive),
      ).toBe(true);
      expect(
        chunks.filter((c) => c.documentVersionId === v2Id).every((c) => c.isActive),
      ).toBe(true);
    });

    it('con varias áreas, todas quedan en el documento y en los fragmentos', async () => {
      const seeded = await seedDocument(prisma, { areaIds: [AREA_IDS.ventas] });
      await seedProcessedVersion(prisma, {
        documentId: seeded.id,
        versionId: seeded.versionId,
        areaIds: [AREA_IDS.ventas],
      });
      const both = [AREA_IDS.ventas, AREA_IDS.operaciones];

      const updated = await repository.runInTransaction((tx) =>
        repository.replaceAreas(tx, seeded.id, both),
      );

      expect([...updated.areaIds].sort()).toEqual([...both].sort());
      const chunks = await prisma.chunk.findMany({ where: { documentId: seeded.id } });
      for (const chunk of chunks) {
        expect([...chunk.areaIds].sort()).toEqual([...both].sort());
      }
    });

    it('con ownerId, el documento queda con el responsable nuevo; sin ownerId, no cambia', async () => {
      const seeded = await seedDocument(prisma, { areaIds: [AREA_IDS.ventas] });
      const ownerBefore = (await prisma.document.findUniqueOrThrow({ where: { id: seeded.id } }))
        .ownerId;

      const withoutOwner = await repository.runInTransaction((tx) =>
        repository.replaceAreas(tx, seeded.id, [AREA_IDS.operaciones]),
      );
      expect(withoutOwner.ownerId).toBe(ownerBefore);

      const withOwner = await repository.runInTransaction((tx) =>
        repository.replaceAreas(
          tx,
          seeded.id,
          [AREA_IDS.operaciones],
          FIXTURE_USERS.empleadoOperaciones.id,
        ),
      );
      expect(withOwner.ownerId).toBe(FIXTURE_USERS.empleadoOperaciones.id);
      expect(
        (await prisma.document.findUniqueOrThrow({ where: { id: seeded.id } })).ownerId,
      ).toBe(FIXTURE_USERS.empleadoOperaciones.id);
    });

    it('no toca los fragmentos de otro documento', async () => {
      const target = await seedDocument(prisma, { areaIds: [AREA_IDS.ventas] });
      const other = await seedDocument(prisma, { areaIds: [AREA_IDS.ventas] });
      await seedProcessedVersion(prisma, {
        documentId: other.id,
        versionId: other.versionId,
        areaIds: [AREA_IDS.ventas],
      });

      await repository.runInTransaction((tx) =>
        repository.replaceAreas(tx, target.id, [AREA_IDS.operaciones]),
      );

      const otherChunks = await prisma.chunk.findMany({ where: { documentId: other.id } });
      for (const chunk of otherChunks) {
        expect(chunk.areaIds).toEqual([AREA_IDS.ventas]);
      }
    });

    it('si la transacción se deshace, ni las áreas ni los fragmentos cambian', async () => {
      const seeded = await seedDocument(prisma, { areaIds: [AREA_IDS.ventas] });
      await seedProcessedVersion(prisma, {
        documentId: seeded.id,
        versionId: seeded.versionId,
        areaIds: [AREA_IDS.ventas],
      });

      await expect(
        repository.runInTransaction(async (tx) => {
          await repository.replaceAreas(tx, seeded.id, [AREA_IDS.operaciones]);
          throw new Error('falla después de cambiar las áreas');
        }),
      ).rejects.toThrow('falla después de cambiar las áreas');

      const areas = await prisma.documentArea.findMany({ where: { documentId: seeded.id } });
      expect(areas.map((area) => area.areaId)).toEqual([AREA_IDS.ventas]);
      const chunks = await prisma.chunk.findMany({ where: { documentId: seeded.id } });
      for (const chunk of chunks) {
        expect(chunk.areaIds).toEqual([AREA_IDS.ventas]);
      }
    });
  });

  describe('addVersion (R7, R7b, R8)', () => {
    const versionsOf = (documentId: string) =>
      prisma.documentVersion.findMany({
        where: { documentId },
        orderBy: { versionNumber: 'asc' },
        select: { id: true, versionNumber: true, status: true, processingStatus: true },
      });

    it('R7: la v1 pasa a REPLACED con sus fragmentos inactivos y la v2 nace CURRENT y PENDING', async () => {
      const seeded = await seedDocument(prisma, { areaIds: [AREA_IDS.ventas] });
      await seedProcessedVersion(prisma, {
        documentId: seeded.id,
        versionId: seeded.versionId,
        areaIds: [AREA_IDS.ventas],
      });
      const v2 = newVersion(seeded.id, 'b'.repeat(64));

      const updated = await repository.runInTransaction(async (tx) => {
        await repository.lockForUpdate(tx, seeded.id);
        return repository.addVersion(tx, seeded.id, v2);
      });

      // Lo que devuelve: el documento con la v2 como vigente.
      expect(updated.currentVersion).toMatchObject({
        id: v2.id,
        versionNumber: 2,
        status: 'CURRENT',
        processingStatus: 'PENDING',
        storageKey: v2.storageKey,
        originalFileName: 'manual-v-nueva.pdf',
        checksum: v2.checksum,
      });

      // Lo que quedó en la base.
      expect(await versionsOf(seeded.id)).toEqual([
        { id: seeded.versionId, versionNumber: 1, status: 'REPLACED', processingStatus: 'READY' },
        { id: v2.id, versionNumber: 2, status: 'CURRENT', processingStatus: 'PENDING' },
      ]);
      const v1Chunks = await prisma.chunk.findMany({
        where: { documentVersionId: seeded.versionId },
      });
      expect(v1Chunks).toHaveLength(2);
      expect(v1Chunks.every((chunk) => !chunk.isActive)).toBe(true);
      // La v2 todavía no tiene fragmentos: los crea el worker al procesarla.
      expect(await prisma.chunk.count({ where: { documentVersionId: v2.id } })).toBe(0);
    });

    it('el número de la nueva es el máximo + 1, aunque ya haya varias versiones', async () => {
      const seeded = await seedDocument(prisma, { areaIds: [AREA_IDS.ventas] });
      await replaceCurrentVersion(prisma, seeded.id, 2, 'c'.repeat(64));
      const v3 = newVersion(seeded.id, 'd'.repeat(64));

      const updated = await repository.runInTransaction(async (tx) => {
        await repository.lockForUpdate(tx, seeded.id);
        return repository.addVersion(tx, seeded.id, v3);
      });

      expect(updated.currentVersion.versionNumber).toBe(3);
      expect((await versionsOf(seeded.id)).map((v) => `${v.versionNumber}:${v.status}`)).toEqual([
        '1:REPLACED',
        '2:REPLACED',
        '3:CURRENT',
      ]);
    });

    it('no toca los fragmentos de otro documento', async () => {
      const target = await seedDocument(prisma, { areaIds: [AREA_IDS.ventas] });
      const other = await seedDocument(prisma, { areaIds: [AREA_IDS.ventas] });
      await seedProcessedVersion(prisma, {
        documentId: other.id,
        versionId: other.versionId,
        areaIds: [AREA_IDS.ventas],
      });

      await repository.runInTransaction(async (tx) => {
        await repository.lockForUpdate(tx, target.id);
        return repository.addVersion(tx, target.id, newVersion(target.id, 'e'.repeat(64)));
      });

      const otherChunks = await prisma.chunk.findMany({ where: { documentId: other.id } });
      expect(otherChunks.every((chunk) => chunk.isActive)).toBe(true);
    });

    describe('R7b: fecha de revisión', () => {
      it('con reviewDate, el documento queda con la fecha nueva', async () => {
        const seeded = await seedDocument(prisma, { areaIds: [AREA_IDS.ventas] });
        const reviewDate = new Date('2028-05-20T00:00:00.000Z');

        const updated = await repository.runInTransaction(async (tx) => {
          await repository.lockForUpdate(tx, seeded.id);
          return repository.addVersion(tx, seeded.id, newVersion(seeded.id, 'f'.repeat(64)), reviewDate);
        });

        expect(updated.reviewDate.toISOString().slice(0, 10)).toBe('2028-05-20');
        const stored = await prisma.document.findUniqueOrThrow({ where: { id: seeded.id } });
        expect(stored.reviewDate.toISOString().slice(0, 10)).toBe('2028-05-20');
      });

      it('sin reviewDate, queda la que estaba', async () => {
        const seeded = await seedDocument(prisma, { areaIds: [AREA_IDS.ventas] });
        const before = await prisma.document.findUniqueOrThrow({ where: { id: seeded.id } });

        await repository.runInTransaction(async (tx) => {
          await repository.lockForUpdate(tx, seeded.id);
          return repository.addVersion(tx, seeded.id, newVersion(seeded.id, '9'.repeat(64)));
        });

        const after = await prisma.document.findUniqueOrThrow({ where: { id: seeded.id } });
        expect(after.reviewDate.toISOString()).toBe(before.reviewDate.toISOString());
      });
    });

    it('si la transacción se deshace, la v1 sigue CURRENT con sus fragmentos activos y no hay v2 (R9)', async () => {
      const seeded = await seedDocument(prisma, { areaIds: [AREA_IDS.ventas] });
      await seedProcessedVersion(prisma, {
        documentId: seeded.id,
        versionId: seeded.versionId,
        areaIds: [AREA_IDS.ventas],
      });

      await expect(
        repository.runInTransaction(async (tx) => {
          await repository.lockForUpdate(tx, seeded.id);
          await repository.addVersion(tx, seeded.id, newVersion(seeded.id, '8'.repeat(64)));
          throw new Error('falla la cola después de crear la versión');
        }),
      ).rejects.toThrow('falla la cola después de crear la versión');

      expect(await versionsOf(seeded.id)).toEqual([
        { id: seeded.versionId, versionNumber: 1, status: 'CURRENT', processingStatus: 'READY' },
      ]);
      const chunks = await prisma.chunk.findMany({ where: { documentId: seeded.id } });
      expect(chunks.every((chunk) => chunk.isActive)).toBe(true);
    });

    // E10 a nivel repositorio: con el bloqueo, las dos se aplican en orden (D3).
    it('E10: dos versiones nuevas a la vez, con bloqueo, terminan en 2 y 3 con una sola CURRENT', async () => {
      const seeded = await seedDocument(prisma, { areaIds: [AREA_IDS.ventas] });
      const first = newVersion(seeded.id, '2'.repeat(64));
      const second = newVersion(seeded.id, '3'.repeat(64));

      const results = await Promise.all(
        [first, second].map((version) =>
          repository.runInTransaction(async (tx) => {
            await repository.lockForUpdate(tx, seeded.id);
            return repository.addVersion(tx, seeded.id, version);
          }),
        ),
      );

      expect(
        results.map((r) => r.currentVersion.versionNumber).sort((a, b) => a - b),
      ).toEqual([2, 3]);
      const versions = await versionsOf(seeded.id);
      expect(versions.map((v) => v.versionNumber)).toEqual([1, 2, 3]);
      expect(versions.filter((v) => v.status === 'CURRENT')).toHaveLength(1);
      expect(versions[2].status).toBe('CURRENT');
    }, 15000);

    // Sin bloqueo, la base es la última defensa: el índice parcial (o el número repetido) rechaza la
    // segunda CURRENT y el repositorio lo traduce a ConcurrentVersionError (R8; plan 003, sección 5).
    it('R8: sin bloqueo, si otra transacción ya creó la vigente, addVersion rechaza con ConcurrentVersionError', async () => {
      const seeded = await seedDocument(prisma, { areaIds: [AREA_IDS.ventas] });
      const xWrote = deferred();
      const releaseX = deferred();

      // X: otra escritura que NO usa lockForUpdate. Reemplaza la v1 y crea la v2 CURRENT, sin confirmar.
      const x = prisma.$transaction(
        async (tx) => {
          await replaceCurrentVersion(tx, seeded.id, 2, '4'.repeat(64));
          xWrote.resolve();
          await releaseX.promise;
        },
        { timeout: 10000 },
      );
      await untilSignalOrFailure(xWrote.promise, x);

      // Y: addVersion SIN lockForUpdate. Su UPDATE de la v1 espera la fila que tiene X.
      const y = repository.runInTransaction((tx) =>
        repository.addVersion(tx, seeded.id, newVersion(seeded.id, '5'.repeat(64))),
      );
      let yError: unknown;
      try {
        await sleep(400);
        releaseX.resolve();
        await x;
        yError = await y.then(
          () => undefined,
          (error: unknown) => error,
        );
      } finally {
        releaseX.resolve();
      }

      expect(yError).toBeInstanceOf(ConcurrentVersionError);
      // Quedó lo de X: v1 REPLACED y v2 CURRENT, sin una tercera.
      expect((await versionsOf(seeded.id)).map((v) => `${v.versionNumber}:${v.status}`)).toEqual([
        '1:REPLACED',
        '2:CURRENT',
      ]);
    }, 15000);

    it('una violación de unicidad que no es de versiones sigue sin traducirse', async () => {
      const seeded = await seedDocument(prisma, { areaIds: [AREA_IDS.ventas] });
      // La misma clave de almacenamiento que la v1: storage_key es único (M6 del plan 001).
      const clash = { ...newVersion(seeded.id, '6'.repeat(64)), storageKey: seeded.storageKey };

      const error = await repository
        .runInTransaction(async (tx) => {
          await repository.lockForUpdate(tx, seeded.id);
          return repository.addVersion(tx, seeded.id, clash);
        })
        .then(
          () => undefined,
          (caught: unknown) => caught,
        );

      expect(error).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
      expect(error).not.toBeInstanceOf(ConcurrentVersionError);
    });
  });
});
