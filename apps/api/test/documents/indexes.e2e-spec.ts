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
});
