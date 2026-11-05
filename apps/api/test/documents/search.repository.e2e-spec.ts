/* PrismaDocumentsRepository.search contra la base de tests (spec 004, T06; plan 004, sección 3) */

import { randomUUID } from 'node:crypto';
import { AREA_IDS, FIXTURE_USERS } from '../../src/documents/adapters/fixtures';
import type {
  SearchPage,
  SearchParams,
} from '../../src/documents/documents.repository';
import {
  PrismaDocumentsRepository,
  searchRankingSql,
} from '../../src/documents/prisma-documents.repository';
import { MATCH_END, MATCH_START } from '../../src/documents/search-fragment';
import { Prisma } from '../../src/generated/prisma/client';
import { PrismaService } from '../../src/prisma/prisma.service';
import { cleanDocuments, seedDocument, seedProcessedVersion } from './helpers';

const VENTAS = { areaIds: [AREA_IDS.ventas] };
const ALL = { areaIds: null };
const mark = (word: string) => `${MATCH_START}${word}${MATCH_END}`;
const ids = (page: SearchPage) => page.data.map((hit) => hit.record.id);

describe('PrismaDocumentsRepository.search (integración)', () => {
  let prisma: PrismaService;
  let repository: PrismaDocumentsRepository;

  const search = (text: string, scope: SearchParams['scope'] = ALL, page = 1, limit = 20) =>
    repository.search({ text, scope, page, limit });

  // Un documento de `areaIds` con su versión vigente procesada y estos fragmentos activos.
  async function documentWith(
    contents: string[],
    opts: {
      areaIds?: string[];
      title?: string;
      description?: string;
      createdAt?: Date;
      pageNumbers?: (number | null)[];
      status?: 'ACTIVE' | 'ARCHIVED';
      chunkAreaIds?: string[];
    } = {},
  ) {
    const areaIds = opts.areaIds ?? [AREA_IDS.ventas];
    const document = await seedDocument(prisma, {
      areaIds,
      title: opts.title ?? 'Manual',
      description: opts.description,
      createdAt: opts.createdAt,
      status: opts.status,
    });
    if (contents.length > 0) {
      await seedProcessedVersion(prisma, {
        documentId: document.id,
        versionId: document.versionId,
        areaIds: opts.chunkAreaIds ?? areaIds,
        contents,
        pageNumbers: opts.pageNumbers,
      });
    }
    return document;
  }

  // La versión vigente pasa a REPLACED y se crea otra CURRENT, sin tocar los fragmentos (que quedan
  // activos a propósito: es la defensa de D5).
  async function replaceWithoutDeactivating(documentId: string): Promise<string> {
    const id = randomUUID();
    await prisma.$executeRaw`
      UPDATE document_versions SET status = 'REPLACED'
      WHERE document_id = ${documentId}::uuid AND status = 'CURRENT'
    `;
    await prisma.$executeRaw`
      INSERT INTO document_versions
        (id, document_id, version_number, status, storage_key, original_file_name,
         mime_type, size_bytes, checksum, uploaded_by_id)
      VALUES
        (${id}::uuid, ${documentId}::uuid, 2, 'CURRENT', ${`documents/${documentId}/${id}.pdf`},
         'v2.pdf', 'application/pdf', 1024, ${'d'.repeat(64)}, ${FIXTURE_USERS.admin.id}::uuid)
    `;
    return id;
  }

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

  describe('coincidencias (R2, R5, R6)', () => {
    it('E1: encuentra por contenido, con el fragmento marcado y su página', async () => {
      const document = await documentWith(
        ['Al terminar el turno se hace el cierre de caja diario.'],
        { pageNumbers: [4] },
      );

      const page = await search('cierre de caja', VENTAS);

      expect(ids(page)).toEqual([document.id]);
      expect(page.total).toBe(1);
      const fragment = page.data[0].fragment;
      expect(fragment?.pageNumber).toBe(4);
      expect(fragment?.markedText).toBe(
        `Al terminar el turno se hace el ${mark('cierre')} de ${mark('caja')} diario.`,
      );
    });

    it('E2: encuentra por título un documento sin fragmentos, sin fragmento', async () => {
      const document = await documentWith([], { title: 'Manual de facturación' });

      const page = await search('facturación', VENTAS);

      expect(ids(page)).toEqual([document.id]);
      expect(page.data[0].fragment).toBeNull();
    });

    it('E2: una coincidencia solo en la descripción tampoco tiene fragmento', async () => {
      const document = await documentWith(['Otro tema'], {
        description: 'Cómo se emiten las facturas',
      });

      const page = await search('facturas');

      expect(ids(page)).toEqual([document.id]);
      expect(page.data[0].fragment).toBeNull();
    });

    it.each([['instruccion tecnica'], ['INSTRUCCIÓN TÉCNICA'], ['Instrucción']])(
      'E3: "%s" encuentra "Instrucción técnica" y la marca conserva la tilde',
      async (text) => {
        const document = await documentWith(['Instrucción técnica para el depósito']);

        const page = await search(text);

        expect(ids(page)).toEqual([document.id]);
        expect(page.data[0].fragment?.markedText).toContain(mark('Instrucción'));
      },
    );

    it('E3: tampoco distingue tildes en el título', async () => {
      const document = await documentWith([], { title: 'Instrucción técnica' });

      expect(ids(await search('instruccion'))).toEqual([document.id]);
    });

    it('E4: "procedimientos" encuentra "procedimiento"', async () => {
      const document = await documentWith(['El procedimiento de devolución']);

      expect(ids(await search('procedimientos'))).toEqual([document.id]);
    });

    it('D16: dos palabras en fragmentos distintos no alcanzan', async () => {
      await documentWith(['El cierre del turno', 'La caja chica']);

      expect((await search('cierre caja')).total).toBe(0);
    });

    it('D16: las dos palabras en el título, o entre el título y la descripción, sí', async () => {
      const enTitulo = await documentWith([], { title: 'Cierre de caja' });
      const repartidas = await documentWith([], {
        title: 'Cierre del turno',
        description: 'Incluye la caja chica',
      });

      expect(ids(await search('cierre caja')).sort()).toEqual(
        [enTitulo.id, repartidas.id].sort(),
      );
    });

    it('solo palabras que el español ignora: sin resultados y sin error', async () => {
      await documentWith(['de la para con'], { title: 'de la para' });

      expect(await search('de la para')).toEqual({ data: [], total: 0 });
    });
  });

  describe('visibilidad (R2, R3, D5)', () => {
    it('E5: con el alcance de Ventas no aparece un documento de Operaciones', async () => {
      const operaciones = await documentWith(['Control de inventario'], {
        areaIds: [AREA_IDS.operaciones],
        title: 'Inventario',
      });

      expect((await search('inventario', VENTAS)).total).toBe(0);
      expect(
        ids(await search('inventario', { areaIds: [AREA_IDS.operaciones] })),
      ).toEqual([operaciones.id]);
      expect(ids(await search('inventario', ALL))).toEqual([operaciones.id]);
    });

    it('un usuario sin áreas no encuentra nada', async () => {
      await documentWith(['caja']);

      expect((await search('caja', { areaIds: [] })).total).toBe(0);
    });

    it('E7: un documento ARCHIVED no aparece, ni para el ADMIN, ni por contenido ni por título', async () => {
      await documentWith(['El procedimiento antiguo'], {
        status: 'ARCHIVED',
        title: 'Procedimiento antiguo',
      });

      expect((await search('procedimiento antiguo', ALL)).total).toBe(0);
    });

    it('defensa: un fragmento activo de una versión REPLACED no aparece', async () => {
      const document = await documentWith(['La tarifa vieja']);
      await replaceWithoutDeactivating(document.id);

      expect((await search('tarifa vieja', ALL)).total).toBe(0);
    });

    it('defensa: los fragmentos activos de un documento ARCHIVED no aparecen', async () => {
      await documentWith(['La tarifa vieja'], { status: 'ARCHIVED' });

      expect((await search('tarifa', ALL)).total).toBe(0);
    });

    it('defensa: un fragmento con area_ids de otra área no aparece para quien no es ADMIN', async () => {
      const document = await documentWith(['Control de stock'], {
        chunkAreaIds: [AREA_IDS.operaciones],
      });

      expect((await search('stock', VENTAS)).total).toBe(0);
      expect(ids(await search('stock', ALL))).toEqual([document.id]);
    });

    it('un fragmento inactivo no aparece', async () => {
      const document = await seedDocument(prisma, { areaIds: [AREA_IDS.ventas] });
      await seedProcessedVersion(prisma, {
        documentId: document.id,
        versionId: document.versionId,
        areaIds: [AREA_IDS.ventas],
        contents: ['Control de stock'],
        isActive: false,
      });

      expect((await search('stock', ALL)).total).toBe(0);
    });
  });

  describe('un resultado por documento (R7)', () => {
    it('E8: cinco fragmentos con "stock" dan un solo resultado, con el de más rango', async () => {
      await documentWith([
        'stock uno',
        'stock dos',
        'stock stock stock tres',
        'stock cuatro',
        'stock cinco',
      ]);

      const page = await search('stock');

      expect(page.total).toBe(1);
      expect(page.data).toHaveLength(1);
      expect(page.data[0].fragment?.markedText).toContain('tres');
    });

    it('E8: a igual rango, el fragmento de menor chunk_index', async () => {
      await documentWith(['stock uno', 'stock dos', 'stock tres']);

      const page = await search('stock');

      expect(page.data[0].fragment?.markedText).toBe(`${mark('stock')} uno`);
    });
  });

  describe('orden y paginado (R9, R10, D6)', () => {
    it('R9: el título pesa más que el contenido; a igual rango, el más nuevo primero', async () => {
      const titulo = await documentWith([], {
        title: 'Cierre de caja',
        createdAt: new Date('2026-01-01T10:00:00Z'),
      });
      const viejo = await documentWith(['El cierre de caja diario'], {
        createdAt: new Date('2026-02-01T10:00:00Z'),
      });
      const nuevo = await documentWith(['El cierre de caja diario'], {
        createdAt: new Date('2026-03-01T10:00:00Z'),
      });

      const first = ids(await search('cierre de caja'));
      const second = ids(await search('cierre de caja'));

      expect(first).toEqual([titulo.id, nuevo.id, viejo.id]);
      expect(second).toEqual(first);
    });

    it('R10: pagina y cuenta documentos, también en una página que no existe', async () => {
      for (let i = 0; i < 25; i++) {
        await documentWith([], {
          title: `Stock ${i}`,
          createdAt: new Date(Date.UTC(2026, 0, 1, 0, i)),
        });
      }

      const second = await search('stock', ALL, 2, 20);
      const beyond = await search('stock', ALL, 9, 20);

      expect(second.data).toHaveLength(5);
      expect(second.total).toBe(25);
      expect(beyond).toEqual({ data: [], total: 25 });
    });
  });

  describe('el texto del usuario no es una sentencia ni un operador (E10, D4)', () => {
    it.each([
      ['caja & | ! :'],
      ['"caja"'],
      ['caja:*'],
      ['!!caja'],
      ['(caja'],
      ['caja <-> cierre'],
      ['\\'],
      ["'; DROP TABLE documents; --"],
    ])('"%s" no lanza error', async (text) => {
      await documentWith(['caja y cierre']);

      await expect(search(text)).resolves.toBeDefined();
      expect(await prisma.document.count()).toBe(1);
    });

    it('"caja & | ! :" busca "caja"', async () => {
      const document = await documentWith(['La caja chica']);

      expect(ids(await search('caja & | ! :'))).toEqual([document.id]);
    });
  });

  describe('el fragmento marcado (R8, R11, D8)', () => {
    it('E12: el HTML del documento queda literal y la palabra, entre marcadores', async () => {
      await documentWith(['<script>alert(1)</script> caja']);

      const markedText = (await search('caja')).data[0].fragment?.markedText;

      expect(markedText).toBe(`<script>alert(1)</script> ${mark('caja')}`);
    });

    it('un marcador dentro del contenido se quita antes de marcar', async () => {
      await documentWith([`texto ${MATCH_START}falso${MATCH_END} y caja`]);

      const markedText = (await search('caja')).data[0].fragment?.markedText;

      expect(markedText).toBe(`texto falso y ${mark('caja')}`);
    });
  });

  describe('índice (sección 9 de la spec)', () => {
    // Con pocos datos, el planificador prefiere ir a los fragmentos por versión, o por área si filtra
    // por áreas: otros índices, que tampoco recorren la tabla. Con el alcance del ADMIN (sin filtro de
    // áreas) y sin recorridos secuenciales ni bucles anidados, le queda el índice de texto completo: el
    // test prueba que la expresión de la consulta es la del índice y que el texto llega como constante.
    it('la búsqueda en los fragmentos puede usar chunks_content_fts_es_unaccent_idx', async () => {
      await documentWith(['caja']);
      const query = searchRankingSql({ text: 'caja', scope: ALL, page: 1, limit: 20 });

      const plan = await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SET LOCAL enable_seqscan = off`;
        await tx.$executeRaw`SET LOCAL enable_nestloop = off`;
        return tx.$queryRaw<{ 'QUERY PLAN': string }[]>(
          Prisma.sql`EXPLAIN ${query}`,
        );
      });

      expect(plan.map((row) => row['QUERY PLAN']).join('\n')).toContain(
        'chunks_content_fts_es_unaccent_idx',
      );
    });
  });
});
