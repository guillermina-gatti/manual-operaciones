/* Última revisión de cada documento (spec 005, R8, R10, R11; plan 005, sección 4; T01) */

import { randomUUID } from 'node:crypto';
import { AREA_IDS, FIXTURE_USERS } from '../../src/documents/adapters/fixtures';
import { pendingReviewWhere } from '../../src/documents/document-access.policy';
import type { NewVersion } from '../../src/documents/documents.repository';
import { PrismaDocumentsRepository } from '../../src/documents/prisma-documents.repository';
import { PrismaService } from '../../src/prisma/prisma.service';
import { cleanDocuments, seedDocument, seedProcessedVersion } from './helpers';

interface ColumnInfo {
  column_name: string;
  data_type: string;
  is_nullable: string;
  datetime_precision: number | null;
}

// SQL crudo a propósito: hasta que el usuario corra `prisma generate`, el cliente no conoce las columnas.
describe('Última revisión de un documento (integración)', () => {
  let prisma: PrismaService;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await cleanDocuments(prisma);
  });

  // D13: dos columnas nulas en documents, sin valor por defecto.
  it('documents tiene last_reviewed_at (timestamptz(3)) y last_reviewed_by_id (uuid), las dos nulas', async () => {
    const columns = await prisma.$queryRaw<ColumnInfo[]>`
      SELECT column_name::text, data_type::text, is_nullable::text,
             datetime_precision::int AS datetime_precision
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'documents'
        AND column_name IN ('last_reviewed_at', 'last_reviewed_by_id')
      ORDER BY column_name
    `;

    expect(columns).toEqual([
      {
        column_name: 'last_reviewed_at',
        data_type: 'timestamp with time zone',
        is_nullable: 'YES',
        datetime_precision: 3,
      },
      {
        column_name: 'last_reviewed_by_id',
        data_type: 'uuid',
        is_nullable: 'YES',
        datetime_precision: null,
      },
    ]);
  });

  // R11: la carga no cuenta como revisión; un documento nuevo nace sin la última revisión.
  it('un documento recién sembrado no tiene última revisión', async () => {
    const { id } = await seedDocument(prisma, { areaIds: [AREA_IDS.ventas] });

    const rows = await prisma.$queryRaw<
      { last_reviewed_at: Date | null; last_reviewed_by_id: string | null }[]
    >`
      SELECT last_reviewed_at, last_reviewed_by_id::text AS last_reviewed_by_id
      FROM documents WHERE id = ${id}::uuid
    `;

    expect(rows).toEqual([
      { last_reviewed_at: null, last_reviewed_by_id: null },
    ]);
  });
});

// Spec 005 (T06): "Por revisar" y "Marcar como revisado" en el repositorio.
describe('PrismaDocumentsRepository: revisión (integración, T06)', () => {
  let prisma: PrismaService;
  let repository: PrismaDocumentsRepository;

  // hoy + 30 con el reloj de la integración (9/11/2026 en Argentina).
  const LAST_DAY = new Date('2026-12-09T00:00:00.000Z');
  const adminViewer = { role: 'ADMIN' as const, areaIds: [] };

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

  const seedWithDate = (reviewDate: string, title = reviewDate) =>
    seedDocument(prisma, { areaIds: [AREA_IDS.ventas], reviewDate, title });

  describe('listForReview (R5, D8)', () => {
    it('trae los que vencen hasta la fecha límite, de la fecha más antigua a la más nueva', async () => {
      await seedWithDate('2026-11-19');
      await seedWithDate('2027-02-07'); // al día: fuera
      await seedWithDate('2026-11-04');
      await seedWithDate('2026-11-09');
      await seedWithDate('2026-12-10'); // hoy + 31: fuera

      const { data, total } = await repository.listForReview(
        pendingReviewWhere(adminViewer, FIXTURE_USERS.admin.id, LAST_DAY),
        1,
        20,
      );

      expect(data.map((record) => dateOnly(record.reviewDate))).toEqual([
        '2026-11-04',
        '2026-11-09',
        '2026-11-19',
      ]);
      expect(total).toBe(3);
    });

    it('a igual fecha, por id: el orden no cambia entre pedidos', async () => {
      const seeded = await Promise.all(
        Array.from({ length: 4 }, (_, index) =>
          seedWithDate('2026-11-19', `Mismo día ${index}`),
        ),
      );
      const where = pendingReviewWhere(
        adminViewer,
        FIXTURE_USERS.admin.id,
        LAST_DAY,
      );

      const first = await repository.listForReview(where, 1, 20);
      const second = await repository.listForReview(where, 1, 20);

      const expected = seeded.map((document) => document.id).sort();
      expect(first.data.map((record) => record.id)).toEqual(expected);
      expect(second.data.map((record) => record.id)).toEqual(expected);
    });

    it('pagina como el listado: 25 pendientes, la página 2 de 20 trae 5', async () => {
      for (let day = 1; day <= 25; day++) {
        await seedWithDate(`2026-11-${String(day).padStart(2, '0')}`);
      }

      const { data, total } = await repository.listForReview(
        pendingReviewWhere(adminViewer, FIXTURE_USERS.admin.id, LAST_DAY),
        2,
        20,
      );

      expect(total).toBe(25);
      expect(data.map((record) => dateOnly(record.reviewDate))).toEqual([
        '2026-11-21',
        '2026-11-22',
        '2026-11-23',
        '2026-11-24',
        '2026-11-25',
      ]);
    });
  });

  describe('count', () => {
    it('cuenta los documentos que cumplen el filtro', async () => {
      await seedDocument(prisma, {
        areaIds: [AREA_IDS.ventas],
        ownerId: FIXTURE_USERS.empleadoVentas.id,
      });
      await seedDocument(prisma, { areaIds: [AREA_IDS.ventas] });

      await expect(
        repository.count({ ownerId: FIXTURE_USERS.empleadoVentas.id }),
      ).resolves.toBe(1);
      await expect(repository.count({})).resolves.toBe(2);
    });
  });

  describe('markReviewed (R8)', () => {
    it('cambia la fecha y la última revisión juntas, sin tocar versiones ni fragmentos', async () => {
      const seeded = await seedDocument(prisma, {
        areaIds: [AREA_IDS.ventas],
        reviewDate: '2026-11-04',
      });
      await seedProcessedVersion(prisma, {
        documentId: seeded.id,
        versionId: seeded.versionId,
        areaIds: [AREA_IDS.ventas],
        chunks: 3,
      });
      const chunksBefore = await chunkState(prisma, seeded.id);
      const at = new Date('2026-11-10T02:30:00.000Z');

      const updated = await repository.runInTransaction((tx) =>
        repository.markReviewed(tx, seeded.id, {
          reviewDate: new Date('2027-05-09T00:00:00.000Z'),
          reviewedById: FIXTURE_USERS.empleadoVentas.id,
          at,
        }),
      );

      expect(dateOnly(updated.reviewDate)).toBe('2027-05-09');
      expect(updated.lastReviewedAt).toEqual(at);
      expect(updated.lastReviewedById).toBe(FIXTURE_USERS.empleadoVentas.id);
      expect(updated.currentVersion.id).toBe(seeded.versionId);

      const versions = await prisma.documentVersion.findMany({
        where: { documentId: seeded.id },
      });
      expect(versions).toHaveLength(1);
      expect(versions[0]).toMatchObject({
        id: seeded.versionId,
        status: 'CURRENT',
      });
      await expect(chunkState(prisma, seeded.id)).resolves.toEqual(
        chunksBefore,
      );
    });

    it('si la transacción se deshace, no queda nada', async () => {
      const seeded = await seedDocument(prisma, {
        areaIds: [AREA_IDS.ventas],
        reviewDate: '2026-11-04',
      });

      await expect(
        repository.runInTransaction(async (tx) => {
          await repository.markReviewed(tx, seeded.id, {
            reviewDate: new Date('2027-05-09T00:00:00.000Z'),
            reviewedById: FIXTURE_USERS.empleadoVentas.id,
            at: new Date(),
          });
          throw new Error('falla después de escribir');
        }),
      ).rejects.toThrow('falla después de escribir');

      const row = await prisma.document.findUniqueOrThrow({
        where: { id: seeded.id },
      });
      expect(dateOnly(row.reviewDate)).toBe('2026-11-04');
      expect(row.lastReviewedAt).toBeNull();
      expect(row.lastReviewedById).toBeNull();
    });
  });
});

const dateOnly = (date: Date) => date.toISOString().slice(0, 10);

// Lo que la revisión no puede cambiar de los fragmentos (R8).
async function chunkState(prisma: PrismaService, documentId: string) {
  return prisma.chunk.findMany({
    where: { documentId },
    select: { id: true, isActive: true, areaIds: true },
    orderBy: { chunkIndex: 'asc' },
  });
}

// Spec 005 (T07, R10, D14): la versión nueva con fecha cuenta como revisión.
describe('PrismaDocumentsRepository: addVersion y la última revisión (integración, T07)', () => {
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

  // Los datos de una versión nueva, subida por el ADMIN.
  function newVersion(documentId: string, checksum: string): NewVersion {
    const id = randomUUID();
    return {
      id,
      storageKey: `documents/${documentId}/${id}.pdf`,
      originalFileName: 'manual-v2.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 4096,
      checksum,
      uploadedById: FIXTURE_USERS.admin.id,
    };
  }

  it('con fecha nueva, registra como revisor a quien sube la versión, con el mismo instante que updated_at', async () => {
    const seeded = await seedDocument(prisma, {
      areaIds: [AREA_IDS.ventas],
      reviewDate: '2026-11-04',
    });
    const before = new Date();

    await repository.runInTransaction((tx) =>
      repository.addVersion(
        tx,
        seeded.id,
        newVersion(seeded.id, 'b'.repeat(64)),
        new Date('2027-11-09T00:00:00.000Z'),
      ),
    );
    const after = new Date();

    const row = await prisma.document.findUniqueOrThrow({
      where: { id: seeded.id },
    });
    expect(dateOnly(row.reviewDate)).toBe('2027-11-09');
    expect(row.lastReviewedById).toBe(FIXTURE_USERS.admin.id);
    expect(row.lastReviewedAt).not.toBeNull();
    expect(row.lastReviewedAt!.getTime()).toBeGreaterThanOrEqual(
      before.getTime(),
    );
    expect(row.lastReviewedAt!.getTime()).toBeLessThanOrEqual(after.getTime());
    expect(row.lastReviewedAt).toEqual(row.updatedAt);
  });

  it('sin fecha nueva, la última revisión no cambia', async () => {
    const lastReview = {
      at: new Date('2026-05-04T14:12:09.000Z'),
      byId: FIXTURE_USERS.empleadoVentas.id,
    };
    const seeded = await seedDocument(prisma, {
      areaIds: [AREA_IDS.ventas],
      reviewDate: '2026-11-04',
      lastReview,
    });

    await repository.runInTransaction((tx) =>
      repository.addVersion(
        tx,
        seeded.id,
        newVersion(seeded.id, 'c'.repeat(64)),
      ),
    );

    const row = await prisma.document.findUniqueOrThrow({
      where: { id: seeded.id },
    });
    expect(dateOnly(row.reviewDate)).toBe('2026-11-04');
    expect(row.lastReviewedAt).toEqual(lastReview.at);
    expect(row.lastReviewedById).toBe(lastReview.byId);
  });

  it('si la transacción se deshace, la revisión tampoco queda', async () => {
    const seeded = await seedDocument(prisma, {
      areaIds: [AREA_IDS.ventas],
      reviewDate: '2026-11-04',
    });

    await expect(
      repository.runInTransaction(async (tx) => {
        await repository.addVersion(
          tx,
          seeded.id,
          newVersion(seeded.id, 'd'.repeat(64)),
          new Date('2027-11-09T00:00:00.000Z'),
        );
        throw new Error('falla la cola después de addVersion');
      }),
    ).rejects.toThrow('falla la cola después de addVersion');

    const row = await prisma.document.findUniqueOrThrow({
      where: { id: seeded.id },
    });
    expect(dateOnly(row.reviewDate)).toBe('2026-11-04');
    expect(row.lastReviewedAt).toBeNull();
    expect(row.lastReviewedById).toBeNull();
  });
});
