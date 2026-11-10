/* Columns and indexes of versions (spec 015, T02): what the migration add_procedure_versions must create */

import { randomUUID } from 'node:crypto';
import { FIXTURE_USERS } from '../../src/documents/adapters/fixtures';
import { PrismaService } from '../../src/prisma/prisma.service';

// The one-published index is declared in schema.prisma (D5). The chunk indexes are written by hand in
// other migrations: a new migration would drop them if nobody reviews it.
const REQUIRED_INDEXES = [
  'procedure_versions_one_published_idx',
  'steps_procedure_version_id_step_key_key',
  'procedure_versions_one_draft_idx',
  'chunks_embedding_idx',
  'chunks_content_fts_idx',
  'chunks_content_fts_es_unaccent_idx',
  'chunks_area_ids_idx',
  'chunks_document_id_idx',
];

type Status = 'DRAFT' | 'PUBLISHED' | 'SUPERSEDED';

describe('Version columns and indexes (integration)', () => {
  let prisma: PrismaService;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // Only the tables of this feature; CASCADE reaches versions and steps.
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

  async function insertVersion(procedureId: string, versionNumber: number, status: Status) {
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

  // Without step_key: the database gives it one. With it, like a copy of a step to another version.
  function insertStep(versionId: string, stepOrder: number, stepKey?: string) {
    return prisma.$executeRaw`
      INSERT INTO steps (id, procedure_version_id, step_order, title, step_key)
      VALUES (${randomUUID()}::uuid, ${versionId}::uuid, ${stepOrder}, 'Contar el efectivo',
              COALESCE(${stepKey ?? null}::uuid, gen_random_uuid()))
    `;
  }

  async function count(table: string): Promise<number> {
    const [row] = await prisma.$queryRawUnsafe<{ total: number }[]>(
      `SELECT count(*)::int AS total FROM ${table}`,
    );
    return row.total;
  }

  it('has the new indexes and keeps the old and the chunk ones', async () => {
    const rows = await prisma.$queryRaw<{ indexname: string }[]>`
      SELECT indexname FROM pg_indexes
      WHERE schemaname = current_schema() AND indexname::text = ANY(${REQUIRED_INDEXES}::text[])
    `;

    expect(rows.map((row) => row.indexname).sort()).toEqual([...REQUIRED_INDEXES].sort());
  });

  it('R4: a second PUBLISHED of the same procedure is rejected', async () => {
    const procedureId = await insertProcedure();
    await insertVersion(procedureId, 1, 'PUBLISHED');

    await expect(insertVersion(procedureId, 2, 'PUBLISHED')).rejects.toThrow(
      /procedure_versions_one_published_idx/,
    );
    expect(await count('procedure_versions')).toBe(1);
  });

  it('the one-published index is partial: DRAFT and SUPERSEDED do not count, and each procedure has its own', async () => {
    const procedureId = await insertProcedure();

    await insertVersion(procedureId, 1, 'SUPERSEDED');
    await insertVersion(procedureId, 2, 'SUPERSEDED');
    await insertVersion(procedureId, 3, 'PUBLISHED');
    await insertVersion(procedureId, 4, 'DRAFT');
    await insertVersion(await insertProcedure(), 1, 'PUBLISHED');

    expect(await count('procedure_versions')).toBe(5);
  });

  it('a new version is not critical and not published', async () => {
    const versionId = await insertVersion(await insertProcedure(), 1, 'DRAFT');

    const [row] = await prisma.$queryRaw<
      { is_critical: boolean; published_at: Date | null; published_by_id: string | null; change_summary: string | null }[]
    >`SELECT is_critical, published_at, published_by_id, change_summary FROM procedure_versions WHERE id = ${versionId}::uuid`;

    expect(row).toEqual({
      is_critical: false,
      published_at: null,
      published_by_id: null,
      change_summary: null,
    });
  });

  it('D11: a step inserted without step_key gets its own, different each time', async () => {
    const versionId = await insertVersion(await insertProcedure(), 1, 'DRAFT');
    await insertStep(versionId, 1);
    await insertStep(versionId, 2);

    const rows = await prisma.$queryRaw<{ step_key: string }[]>`
      SELECT step_key::text FROM steps WHERE procedure_version_id = ${versionId}::uuid
    `;

    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((row) => row.step_key)).size).toBe(2);
  });

  it('D11: the same step_key cannot repeat in a version, but a copy in another version keeps it', async () => {
    const procedureId = await insertProcedure();
    const first = await insertVersion(procedureId, 1, 'SUPERSEDED');
    const second = await insertVersion(procedureId, 2, 'DRAFT');
    const stepKey = randomUUID();
    await insertStep(first, 1, stepKey);

    await expect(insertStep(first, 2, stepKey)).rejects.toThrow(
      /steps_procedure_version_id_step_key_key/,
    );
    await insertStep(second, 1, stepKey);
    expect(await count('steps')).toBe(2);
  });
});
