/* Tables and indexes of procedures (spec 006, T02): what the migration add_procedures must create and keep */

import { randomUUID } from 'node:crypto';
import { AREA_IDS, FIXTURE_USERS } from '../../src/documents/adapters/fixtures';
import { PrismaService } from '../../src/prisma/prisma.service';

// The chunk indexes are written by hand in other migrations and Prisma does not describe them: a new
// migration would drop them if nobody reviews it. The one-draft index is declared in schema.prisma (D2).
const REQUIRED_INDEXES = [
  'procedure_versions_one_draft_idx',
  'chunks_embedding_idx',
  'chunks_content_fts_idx',
  'chunks_content_fts_es_unaccent_idx',
  'chunks_area_ids_idx',
  'chunks_document_id_idx',
];

describe('Procedures tables and indexes (integration)', () => {
  let prisma: PrismaService;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // Only the tables of this feature; CASCADE reaches versions, steps and areas.
  beforeEach(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE procedures CASCADE');
  });

  // Plain SQL, bypassing the repository and its locks, to hit the constraints themselves.
  async function insertProcedure(): Promise<string> {
    const id = randomUUID();
    await prisma.$executeRaw`
      INSERT INTO procedures (id, owner_id, updated_at)
      VALUES (${id}::uuid, ${FIXTURE_USERS.admin.id}::uuid, now())
    `;
    return id;
  }

  async function insertVersion(
    procedureId: string,
    versionNumber: number,
    status: 'DRAFT' | 'PUBLISHED' | 'SUPERSEDED',
  ): Promise<string> {
    const id = randomUUID();
    await prisma.$executeRaw`
      INSERT INTO procedure_versions
        (id, procedure_id, version_number, status, title, created_by_id, updated_at)
      VALUES
        (${id}::uuid, ${procedureId}::uuid, ${versionNumber},
         ${status}::"ProcedureVersionStatus", 'Cierre de caja',
         ${FIXTURE_USERS.admin.id}::uuid, now())
    `;
    return id;
  }

  function insertStep(versionId: string, stepOrder: number) {
    return prisma.$executeRaw`
      INSERT INTO steps (id, procedure_version_id, step_order, title)
      VALUES (${randomUUID()}::uuid, ${versionId}::uuid, ${stepOrder}, 'Contar el efectivo')
    `;
  }

  function insertArea(procedureId: string, areaId: string) {
    return prisma.$executeRaw`
      INSERT INTO procedure_areas (procedure_id, area_id)
      VALUES (${procedureId}::uuid, ${areaId}::uuid)
    `;
  }

  async function count(table: string): Promise<number> {
    const [row] = await prisma.$queryRawUnsafe<{ total: number }[]>(
      `SELECT count(*)::int AS total FROM ${table}`,
    );
    return row.total;
  }

  it('has the one-draft index and keeps the chunk indexes', async () => {
    const rows = await prisma.$queryRaw<{ indexname: string }[]>`
      SELECT indexname FROM pg_indexes
      WHERE schemaname = current_schema() AND indexname::text = ANY(${REQUIRED_INDEXES}::text[])
    `;

    expect(rows.map((row) => row.indexname).sort()).toEqual(
      [...REQUIRED_INDEXES].sort(),
    );
  });

  it('R3: a second DRAFT of the same procedure is rejected', async () => {
    const procedureId = await insertProcedure();
    await insertVersion(procedureId, 1, 'DRAFT');

    await expect(insertVersion(procedureId, 2, 'DRAFT')).rejects.toThrow(
      /procedure_versions_one_draft_idx/,
    );
    expect(await count('procedure_versions')).toBe(1);
  });

  it('the one-draft index is partial: PUBLISHED and SUPERSEDED versions do not count', async () => {
    const procedureId = await insertProcedure();

    await insertVersion(procedureId, 1, 'SUPERSEDED');
    await insertVersion(procedureId, 2, 'PUBLISHED');
    await insertVersion(procedureId, 3, 'DRAFT');

    expect(await count('procedure_versions')).toBe(3);
  });

  it('each procedure has its own DRAFT', async () => {
    await insertVersion(await insertProcedure(), 1, 'DRAFT');
    await insertVersion(await insertProcedure(), 1, 'DRAFT');

    expect(await count('procedure_versions')).toBe(2);
  });

  it('a version number cannot repeat within a procedure', async () => {
    const procedureId = await insertProcedure();
    await insertVersion(procedureId, 1, 'PUBLISHED');

    await expect(insertVersion(procedureId, 1, 'SUPERSEDED')).rejects.toThrow(
      /procedure_versions_procedure_id_version_number_key/,
    );
  });

  it('R7: two steps of a version cannot share the same order', async () => {
    const versionId = await insertVersion(await insertProcedure(), 1, 'DRAFT');
    await insertStep(versionId, 1);

    await expect(insertStep(versionId, 1)).rejects.toThrow(
      /steps_procedure_version_id_step_order_key/,
    );
    expect(await count('steps')).toBe(1);
  });

  it('R11: an area cannot be assigned twice to a procedure', async () => {
    const procedureId = await insertProcedure();
    await insertArea(procedureId, AREA_IDS.ventas);

    await expect(insertArea(procedureId, AREA_IDS.ventas)).rejects.toThrow(
      /procedure_areas_pkey/,
    );
    await insertArea(procedureId, AREA_IDS.operaciones);
    expect(await count('procedure_areas')).toBe(2);
  });

  it('R10: deleting a procedure deletes its versions, steps and areas', async () => {
    const procedureId = await insertProcedure();
    const versionId = await insertVersion(procedureId, 1, 'DRAFT');
    await insertStep(versionId, 1);
    await insertArea(procedureId, AREA_IDS.ventas);

    await prisma.$executeRaw`DELETE FROM procedures WHERE id = ${procedureId}::uuid`;

    expect(await count('procedure_versions')).toBe(0);
    expect(await count('steps')).toBe(0);
    expect(await count('procedure_areas')).toBe(0);
  });
});
