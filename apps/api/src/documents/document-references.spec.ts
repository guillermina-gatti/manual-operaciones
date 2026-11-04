/* Spec 008 (T04): referencias con nombre de usuarios y áreas, sin directorios (R1, R3, R12; PD3, PD4) */

import { AREA_IDS, FIXTURE_USERS } from './adapters/fixtures';
import { InMemoryAreasDirectory } from './adapters/in-memory-areas-directory';
import { InMemoryUsersDirectory } from './adapters/in-memory-users-directory';
import {
  DocumentReferences,
  ReferenceLookup,
  referenceIdsOf,
} from './document-references';
import { RepositoryUnavailableError } from './documents.repository';
import { findUsersByIds } from './find-users-by-ids';
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

// TODO(spec 008, T05): cuando UsersDirectory.findByIds esté en develop, este bloque se borra junto con
// findUsersByIds.
describe('findUsersByIds (temporal, hasta UsersDirectory.findByIds)', () => {
  it('un findById por cada ID distinto, y omite los que no existen', async () => {
    const users = new InMemoryUsersDirectory();
    const findById = jest.spyOn(users, 'findById');

    const found = await findUsersByIds(users, [
      FIXTURE_USERS.admin.id,
      UNKNOWN_USER,
      FIXTURE_USERS.admin.id,
      FIXTURE_USERS.empleadoVentas.id,
    ]);

    expect(findById).toHaveBeenCalledTimes(3);
    expect(found.map((user) => user.id).sort()).toEqual(
      [FIXTURE_USERS.admin.id, FIXTURE_USERS.empleadoVentas.id].sort(),
    );
  });

  it('sin IDs no llama al directorio', async () => {
    const users = new InMemoryUsersDirectory();
    const findById = jest.spyOn(users, 'findById');

    await expect(findUsersByIds(users, [])).resolves.toEqual([]);
    expect(findById).not.toHaveBeenCalled();
  });

  it('si el directorio falla, deja pasar el error', async () => {
    const users = new InMemoryUsersDirectory();
    jest
      .spyOn(users, 'findById')
      .mockRejectedValue(new RepositoryUnavailableError('caído'));

    await expect(
      findUsersByIds(users, [FIXTURE_USERS.admin.id]),
    ).rejects.toBeInstanceOf(RepositoryUnavailableError);
  });
});

describe('DocumentReferences (T05)', () => {
  const COMPRAS_INACTIVA = { id: COMPRAS, name: 'Compras', isActive: false };

  const build = () => {
    const users = new InMemoryUsersDirectory([
      { ...FIXTURE_USERS.empleadoVentas, isActive: false },
      FIXTURE_USERS.admin,
    ]);
    const areas = new InMemoryAreasDirectory([
      { id: AREA_IDS.ventas, name: 'Ventas', isActive: true },
      COMPRAS_INACTIVA,
    ]);
    return { users, areas, references: new DocumentReferences(users, areas) };
  };

  it('pide usuarios y áreas una sola vez, sin repetidos, y arma las referencias', async () => {
    const { users, areas, references } = build();
    const findUsers = jest.spyOn(users, 'findById');
    const findAreas = jest.spyOn(areas, 'findByIds');

    const lookup = await references.lookup({
      userIds: [
        FIXTURE_USERS.empleadoVentas.id,
        FIXTURE_USERS.admin.id,
        FIXTURE_USERS.admin.id,
      ],
      areaIds: [AREA_IDS.ventas, COMPRAS, AREA_IDS.ventas],
    });

    expect(findUsers).toHaveBeenCalledTimes(2);
    expect(findAreas).toHaveBeenCalledTimes(1);
    expect(findAreas).toHaveBeenCalledWith([AREA_IDS.ventas, COMPRAS]);
    expect(lookup.user(FIXTURE_USERS.empleadoVentas.id)).toStrictEqual({
      id: FIXTURE_USERS.empleadoVentas.id,
      name: FIXTURE_USERS.empleadoVentas.name,
      isActive: false,
    });
    expect(lookup.area(COMPRAS)).toStrictEqual(COMPRAS_INACTIVA);
  });

  it('con listas vacías no llama a los directorios', async () => {
    const { users, areas, references } = build();
    const findUsers = jest.spyOn(users, 'findById');
    const findAreas = jest.spyOn(areas, 'findByIds');

    const lookup = await references.lookup({ userIds: [], areaIds: [] });

    expect(findUsers).not.toHaveBeenCalled();
    expect(findAreas).not.toHaveBeenCalled();
    expect(lookup.has({ userIds: [], areaIds: [] })).toBe(true);
  });

  it('E10: lo que no existe sale con name null, y cuenta como buscado (P6, R12)', async () => {
    const { references } = build();

    const lookup = await references.lookup({
      userIds: [UNKNOWN_USER],
      areaIds: [AREA_IDS.operaciones],
    });

    expect(lookup.user(UNKNOWN_USER)).toStrictEqual({
      id: UNKNOWN_USER,
      name: null,
      isActive: false,
    });
    expect(lookup.area(AREA_IDS.operaciones).name).toBeNull();
    expect(
      lookup.has({ userIds: [UNKNOWN_USER], areaIds: [AREA_IDS.operaciones] }),
    ).toBe(true);
  });

  it.each(['usuarios', 'áreas'])(
    'un directorio de %s caído hace fallar el lookup (R13)',
    async (which) => {
      const { users, areas, references } = build();
      const error = new RepositoryUnavailableError('caído');
      if (which === 'usuarios') {
        jest.spyOn(users, 'findById').mockRejectedValue(error);
      } else {
        jest.spyOn(areas, 'findByIds').mockRejectedValue(error);
      }

      await expect(
        references.lookup({
          userIds: [FIXTURE_USERS.admin.id],
          areaIds: [AREA_IDS.ventas],
        }),
      ).rejects.toBe(error);
    },
  );
});
