/* Última revisión de cada documento (spec 005, R8, R10, R11; plan 005, sección 4; T01) */

import { AREA_IDS } from '../../src/documents/adapters/fixtures';
import { PrismaService } from '../../src/prisma/prisma.service';
import { cleanDocuments, seedDocument } from './helpers';

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
