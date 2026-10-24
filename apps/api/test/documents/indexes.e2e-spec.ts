/* Índices que las migraciones no pueden perder (spec 003, R8; plan 003, D1 y D2) */

import { randomUUID } from 'node:crypto';
import { AREA_IDS, FIXTURE_USERS } from '../../src/documents/adapters/fixtures';
import { PrismaService } from '../../src/prisma/prisma.service';
import { cleanDocuments, seedDocument } from './helpers';

// Los dos de Guille están escritos a mano en la migración de chunks: Prisma no los describe y una
// migración nueva los borraría si nadie la revisa (D1). El de M4 se declara en schema.prisma (D2).
const REQUIRED_INDEXES = [
  'chunks_embedding_idx',
  'chunks_content_fts_idx',
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
