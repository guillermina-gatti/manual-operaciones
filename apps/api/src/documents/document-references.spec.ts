/* Spec 008 (T04): referencias con nombre de usuarios y áreas, sin directorios (R1, R3, R12; PD3, PD4) */

import { AREA_IDS, FIXTURE_USERS } from './adapters/fixtures';
import { ReferenceLookup, referenceIdsOf } from './document-references';
import type { DocumentRecord } from './documents.repository';

const UNKNOWN_USER = '0b000000-0000-4000-8000-000000000099';
const COMPRAS = '0a000000-0000-4000-8000-000000000003';

const record = (overrides: Partial<DocumentRecord> = {}): DocumentRecord => ({
  id: '0c000000-0000-4000-8000-000000000001',
  title: 'Manual de caja',
  description: null,
  status: 'ACTIVE',
  areaIds: [AREA_IDS.ventas],
  ownerId: FIXTURE_USERS.empleadoVentas.id,
  reviewDate: new Date('2027-01-15T00:00:00.000Z'),
  createdById: FIXTURE_USERS.admin.id,
  createdAt: new Date('2026-10-01T12:00:00.000Z'),
  lastReviewedAt: null,
  lastReviewedById: null,
  currentVersion: {
    id: '0d000000-0000-4000-8000-000000000001',
    versionNumber: 1,
    status: 'CURRENT',
    storageKey: 'documents/x/v1.pdf',
    originalFileName: 'manual.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 1024,
    checksum: 'a'.repeat(64),
    processingStatus: 'READY',
    createdAt: new Date('2026-10-01T12:00:00.000Z'),
  },
  ...overrides,
});

describe('ReferenceLookup', () => {
  // Lo que devolverían los directorios: con más campos de los que puede mostrar la respuesta.
  const lookup = ReferenceLookup.from(
    [{ ...FIXTURE_USERS.empleadoVentas, name: 'Elena', isActive: false }],
    [
      { id: AREA_IDS.ventas, name: 'Ventas', isActive: true },
      { id: COMPRAS, name: 'Compras', isActive: false },
    ],
  );

  it('devuelve el nombre y el estado de un usuario encontrado, y nada más (R3)', () => {
    expect(lookup.user(FIXTURE_USERS.empleadoVentas.id)).toStrictEqual({
      id: FIXTURE_USERS.empleadoVentas.id,
      name: 'Elena',
      isActive: false,
    });
  });

  it('devuelve el nombre y el estado de un área encontrada', () => {
    expect(lookup.area(AREA_IDS.ventas)).toStrictEqual({
      id: AREA_IDS.ventas,
      name: 'Ventas',
      isActive: true,
    });
    expect(lookup.area(COMPRAS)).toStrictEqual({
      id: COMPRAS,
      name: 'Compras',
      isActive: false,
    });
  });

  it('E10: un ID que no se encontró da name null e isActive false (R12)', () => {
    expect(lookup.user(UNKNOWN_USER)).toStrictEqual({
      id: UNKNOWN_USER,
      name: null,
      isActive: false,
    });
    expect(lookup.area(AREA_IDS.operaciones)).toStrictEqual({
      id: AREA_IDS.operaciones,
      name: null,
      isActive: false,
    });
  });

  it('un usuario y un área con el mismo ID no se mezclan', () => {
    const mixed = ReferenceLookup.from(
      [{ id: 'x', name: 'Persona', isActive: true }],
      [{ id: 'x', name: 'Área', isActive: true }],
    );

    expect(mixed.user('x').name).toBe('Persona');
    expect(mixed.area('x').name).toBe('Área');
  });

  it('has: verdadero solo si se buscaron todos los IDs', () => {
    expect(
      lookup.has({
        userIds: [FIXTURE_USERS.empleadoVentas.id],
        areaIds: [AREA_IDS.ventas, COMPRAS],
      }),
    ).toBe(true);
    expect(
      lookup.has({ userIds: [UNKNOWN_USER], areaIds: [AREA_IDS.ventas] }),
    ).toBe(false);
    expect(lookup.has({ userIds: [], areaIds: [AREA_IDS.operaciones] })).toBe(
      false,
    );
  });

  it('has: un ID que se buscó y no existía cuenta como buscado', () => {
    const withMissing = ReferenceLookup.from([], [], {
      userIds: [UNKNOWN_USER],
      areaIds: [],
    });

    expect(withMissing.has({ userIds: [UNKNOWN_USER], areaIds: [] })).toBe(
      true,
    );
  });
});

describe('referenceIdsOf', () => {
  it('junta responsables y áreas de todos los documentos, sin repetidos', () => {
    const ids = referenceIdsOf([
      { record: record(), withReview: false },
      {
        record: record({ areaIds: [AREA_IDS.ventas, COMPRAS] }),
        withReview: false,
      },
      {
        record: record({ ownerId: FIXTURE_USERS.admin.id }),
        withReview: false,
      },
    ]);

    expect(ids.userIds.sort()).toEqual(
      [FIXTURE_USERS.empleadoVentas.id, FIXTURE_USERS.admin.id].sort(),
    );
    expect(ids.areaIds.sort()).toEqual([AREA_IDS.ventas, COMPRAS].sort());
  });

  it('E5: el revisor solo si la respuesta lleva review (PD3)', () => {
    const reviewed = record({
      lastReviewedAt: new Date('2026-10-20T12:00:00.000Z'),
      lastReviewedById: FIXTURE_USERS.supervisorVentas.id,
    });

    expect(
      referenceIdsOf([{ record: reviewed, withReview: false }]).userIds,
    ).not.toContain(FIXTURE_USERS.supervisorVentas.id);
    expect(
      referenceIdsOf([{ record: reviewed, withReview: true }]).userIds,
    ).toContain(FIXTURE_USERS.supervisorVentas.id);
  });

  it('sin revisión no agrega nada aunque lleve review', () => {
    expect(referenceIdsOf([{ record: record(), withReview: true }])).toEqual({
      userIds: [FIXTURE_USERS.empleadoVentas.id],
      areaIds: [AREA_IDS.ventas],
    });
  });

  it('sin documentos, listas vacías', () => {
    expect(referenceIdsOf([])).toEqual({ userIds: [], areaIds: [] });
  });
});
