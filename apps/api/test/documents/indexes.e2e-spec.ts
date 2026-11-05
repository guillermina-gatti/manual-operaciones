/* Índices que las migraciones no pueden perder (spec 003, R8; plan 003, D1 y D2; plan 004, D3 y D15) */

import { randomUUID } from 'node:crypto';
import { AREA_IDS, FIXTURE_USERS } from '../../src/documents/adapters/fixtures';
import { PrismaService } from '../../src/prisma/prisma.service';
import { cleanDocuments, seedDocument } from './helpers';

// Los dos de Guille están escritos a mano en la migración de chunks: Prisma no los describe y una
// migración nueva los borraría si nadie la revisa (D1). El de M4 se declara en schema.prisma (D2).
// El de la búsqueda sin tildes (spec 004) también está escrito a mano, en add_document_search.
const REQUIRED_INDEXES = [
  'chunks_embedding_idx',
  'chunks_content_fts_idx',
  'chunks_content_fts_es_unaccent_idx',
  'document_versions_one_current_idx',
];

// Spec 011 (plan 011, 1.1 y 1.4): los índices de la tabla de alertas los genera Prisma; los CHECK no,
// van escritos a mano al final de add_document_conflict_alerts (plan 011, 1.3).
const CONFLICT_ALERT_INDEXES = [
  'document_conflict_alerts_version_a_id_version_b_id_key',
  'document_conflict_alerts_status_last_detected_at_idx',
  'document_conflict_alerts_status_resolved_at_idx',
  'document_conflict_alerts_document_a_id_idx',
  'document_conflict_alerts_document_b_id_idx',
];
const CONFLICT_ALERT_CHECKS = [
  'document_conflict_alerts_occurrences_check',
  'document_conflict_alerts_pair_order_check',
  'document_conflict_alerts_resolution_check',
];

describe('Índices de la base (integración)', () => {
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

  // Spec 004, R5 (plan 004, 2.2): la configuración es_unaccent y la extensión que usa. Prisma no las
  // describe, pero tampoco las borra; se exigen igual porque sin ellas el índice no se puede crear.
  it('existen la configuración es_unaccent y la extensión unaccent', async () => {
    const configs = await prisma.$queryRaw<{ cfgname: string }[]>`
      SELECT cfgname::text FROM pg_ts_config WHERE cfgname = 'es_unaccent'
    `;
    const extensions = await prisma.$queryRaw<{ extname: string }[]>`
      SELECT extname::text FROM pg_extension WHERE extname = 'unaccent'
    `;

    expect(configs).toHaveLength(1);
    expect(extensions).toHaveLength(1);
  });

  // Spec 004, R5: sin distinguir tildes ni mayúsculas, y con las variantes de una misma palabra.
  it.each([
    ['Instrucción técnica', 'instruccion tecnica'],
    ['instruccion tecnica', 'INSTRUCCIÓN TÉCNICA'],
    ['procedimiento de devolución', 'procedimientos'],
  ])('R5: "%s" se encuentra buscando "%s"', async (text, search) => {
    const [row] = await prisma.$queryRaw<{ matches: boolean }[]>`
      SELECT to_tsvector('es_unaccent'::regconfig, ${text})
        @@ plainto_tsquery('es_unaccent'::regconfig, ${search}) AS matches
    `;

    expect(row.matches).toBe(true);
  });

  it('existen los índices de chunks y el de una sola versión CURRENT', async () => {
    const rows = await prisma.$queryRaw<{ indexname: string }[]>`
      SELECT indexname FROM pg_indexes
      WHERE schemaname = current_schema() AND indexname::text = ANY(${REQUIRED_INDEXES}::text[])
    `;

    expect(rows.map((row) => row.indexname).sort()).toEqual(
      [...REQUIRED_INDEXES].sort(),
    );
  });

  // Inserta con SQL una versión de ese documento, sin pasar por el repositorio ni por sus bloqueos.
  function insertVersion(
    documentId: string,
    versionNumber: number,
    status: 'CURRENT' | 'REPLACED',
  ) {
    const id = randomUUID();
    return prisma.$executeRaw`
      INSERT INTO document_versions
        (id, document_id, version_number, status, storage_key, original_file_name,
         mime_type, size_bytes, checksum, uploaded_by_id)
      VALUES
        (${id}::uuid, ${documentId}::uuid, ${versionNumber},
         ${status}::"DocumentVersionStatus", ${`documents/${documentId}/${id}.pdf`},
         'otra.pdf', 'application/pdf', 1024, ${'c'.repeat(64)},
         ${FIXTURE_USERS.admin.id}::uuid)
    `;
  }

  it('R8: una segunda versión CURRENT del mismo documento se rechaza', async () => {
    const document = await seedDocument(prisma, { areaIds: [AREA_IDS.ventas] });

    await expect(insertVersion(document.id, 2, 'CURRENT')).rejects.toThrow(
      /document_versions_one_current_idx/,
    );

    const current = await prisma.documentVersion.count({
      where: { documentId: document.id, status: 'CURRENT' },
    });
    expect(current).toBe(1);
  });

  it('el índice es parcial: las versiones REPLACED no cuentan', async () => {
    const document = await seedDocument(prisma, { areaIds: [AREA_IDS.ventas] });

    await insertVersion(document.id, 2, 'REPLACED');
    await insertVersion(document.id, 3, 'REPLACED');

    const versions = await prisma.documentVersion.count({
      where: { documentId: document.id },
    });
    expect(versions).toBe(3);
  });

  it('dos documentos distintos tienen cada uno su versión CURRENT', async () => {
    await seedDocument(prisma, { areaIds: [AREA_IDS.ventas] });
    await seedDocument(prisma, { areaIds: [AREA_IDS.operaciones] });

    const current = await prisma.documentVersion.count({
      where: { status: 'CURRENT' },
    });
    expect(current).toBe(2);
  });

  // Spec 011 (sección 7.1, E18; plan 011, 1.4). cleanDocuments vacía también esta tabla, por sus FK
  // a documents y document_versions con ON DELETE CASCADE.
  describe('Alertas de contradicciones (spec 011)', () => {
    interface AlertRow {
      documentAId: string;
      documentBId: string;
      versionAId: string;
      versionBId: string;
      status: 'OPEN' | 'RESOLVED';
      occurrences: number;
      resolvedAt: Date | null;
      resolvedById: string | null;
      resolutionNote: string | null;
    }

    // Dos documentos sembrados, con A el de id menor (R11): uuid < uuid ordena como el texto en minúsculas.
    async function seedPair(): Promise<AlertRow> {
      const [a, b] = [
        await seedDocument(prisma, { areaIds: [AREA_IDS.ventas] }),
        await seedDocument(prisma, { areaIds: [AREA_IDS.ventas] }),
      ].sort((x, y) => (x.id < y.id ? -1 : 1));
      return {
        documentAId: a.id,
        documentBId: b.id,
        versionAId: a.versionId,
        versionBId: b.versionId,
        status: 'OPEN',
        occurrences: 1,
        resolvedAt: null,
        resolvedById: null,
        resolutionNote: null,
      };
    }

    // Inserta con SQL, sin pasar por el código: así se prueban las restricciones de la base.
    function insertAlert(row: AlertRow) {
      return prisma.$executeRaw`
        INSERT INTO document_conflict_alerts
          (id, document_a_id, document_b_id, version_a_id, version_b_id, chunk_a_id, chunk_b_id,
           message_id, question, status, occurrences, resolved_at, resolved_by_id, resolution_note)
        VALUES
          (${randomUUID()}::uuid, ${row.documentAId}::uuid, ${row.documentBId}::uuid,
           ${row.versionAId}::uuid, ${row.versionBId}::uuid, ${randomUUID()}::uuid,
           ${randomUUID()}::uuid, ${randomUUID()}::uuid, '¿Quién aprueba una compra?',
           ${row.status}::"ConflictAlertStatus", ${row.occurrences}, ${row.resolvedAt},
           ${row.resolvedById}::uuid, ${row.resolutionNote})
      `;
    }

    async function countAlerts(): Promise<number> {
      const [row] = await prisma.$queryRaw<{ count: number }[]>`
        SELECT count(*)::int AS count FROM document_conflict_alerts
      `;
      return row.count;
    }

    it('existen los índices de la tabla', async () => {
      const rows = await prisma.$queryRaw<{ indexname: string }[]>`
        SELECT indexname FROM pg_indexes
        WHERE schemaname = current_schema()
          AND indexname::text = ANY(${CONFLICT_ALERT_INDEXES}::text[])
      `;

      expect(rows.map((row) => row.indexname).sort()).toEqual(
        [...CONFLICT_ALERT_INDEXES].sort(),
      );
    });

    it('existen los tres CHECK escritos a mano, y ningún otro', async () => {
      const rows = await prisma.$queryRaw<{ conname: string }[]>`
        SELECT conname::text FROM pg_constraint
        WHERE conrelid = 'document_conflict_alerts'::regclass AND contype = 'c'
        ORDER BY conname
      `;

      expect(rows.map((row) => row.conname)).toEqual(CONFLICT_ALERT_CHECKS);
    });

    it('acepta una alerta abierta y una resuelta, con el par en orden', async () => {
      const open = await seedPair();
      const resolved = await seedPair();

      await insertAlert(open);
      await insertAlert({
        ...resolved,
        status: 'RESOLVED',
        resolvedAt: new Date('2026-11-05T15:00:00.000Z'),
        resolvedById: FIXTURE_USERS.admin.id,
        resolutionNote: 'Corregida la política en la v2',
      });

      expect(await countAlerts()).toBe(2);
    });

    it('R11: rechaza el par al revés', async () => {
      const row = await seedPair();

      await expect(
        insertAlert({
          ...row,
          documentAId: row.documentBId,
          documentBId: row.documentAId,
          versionAId: row.versionBId,
          versionBId: row.versionAId,
        }),
      ).rejects.toThrow(/document_conflict_alerts_pair_order_check/);
    });

    it('R2: rechaza el mismo documento en A y en B', async () => {
      const row = await seedPair();

      await expect(
        insertAlert({ ...row, documentBId: row.documentAId }),
      ).rejects.toThrow(/document_conflict_alerts_pair_order_check/);
    });

    it('R15: rechaza una resuelta sin fecha', async () => {
      const row = await seedPair();

      await expect(
        insertAlert({
          ...row,
          status: 'RESOLVED',
          resolvedById: FIXTURE_USERS.admin.id,
        }),
      ).rejects.toThrow(/document_conflict_alerts_resolution_check/);
    });

    it('R15: rechaza una abierta con quién la resolvió', async () => {
      const row = await seedPair();

      await expect(
        insertAlert({ ...row, resolvedById: FIXTURE_USERS.admin.id }),
      ).rejects.toThrow(/document_conflict_alerts_resolution_check/);
    });

    it('R13: rechaza occurrences en 0', async () => {
      const row = await seedPair();

      await expect(insertAlert({ ...row, occurrences: 0 })).rejects.toThrow(
        /document_conflict_alerts_occurrences_check/,
      );
    });

    it('R13: rechaza una segunda alerta con el mismo par de versiones', async () => {
      const row = await seedPair();
      await insertAlert(row);

      await expect(insertAlert(row)).rejects.toThrow(
        /document_conflict_alerts_version_a_id_version_b_id_key/,
      );
      expect(await countAlerts()).toBe(1);
    });
  });
});
