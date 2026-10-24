/* PrismaDocumentsRepository: bloqueo y cambio de áreas, contra la base de tests (spec 003, T06) */

import { randomUUID } from 'node:crypto';
import { AREA_IDS, FIXTURE_USERS } from '../../src/documents/adapters/fixtures';
import type { RepositoryTransaction } from '../../src/documents/documents.repository';
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

describe('PrismaDocumentsRepository: ciclo de vida (integración, T06)', () => {
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
});
