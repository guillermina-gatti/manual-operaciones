import { AREA_IDS, FIXTURE_USERS } from './fixtures';
import { InMemoryAreasDirectory } from './in-memory-areas-directory';
import { InMemoryUsersDirectory } from './in-memory-users-directory';

const UNKNOWN_ID = '0f000000-0000-4000-8000-000000000099';
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('InMemoryAreasDirectory', () => {
  it('findExistingIds devuelve solo las áreas que existen', async () => {
    const areas = new InMemoryAreasDirectory();

    await expect(
      areas.findExistingIds([AREA_IDS.ventas, UNKNOWN_ID]),
    ).resolves.toEqual([AREA_IDS.ventas]);
  });

  it('se puede construir con datos propios del test', async () => {
    const areas = new InMemoryAreasDirectory([UNKNOWN_ID]);

    await expect(
      areas.findExistingIds([AREA_IDS.ventas, UNKNOWN_ID]),
    ).resolves.toEqual([UNKNOWN_ID]);
  });
  it('findByIds incluye áreas inactivas, omite desconocidas y deduplica', async () => {
    const areas = new InMemoryAreasDirectory([
      { id: AREA_IDS.ventas, name: 'Ventas', isActive: true },
      { id: AREA_IDS.operaciones, name: 'Operaciones', isActive: false },
    ]);

    await expect(
      areas.findByIds([AREA_IDS.ventas, AREA_IDS.operaciones, AREA_IDS.operaciones, UNKNOWN_ID]),
    ).resolves.toEqual([
      { id: AREA_IDS.ventas, name: 'Ventas', isActive: true },
      { id: AREA_IDS.operaciones, name: 'Operaciones', isActive: false },
    ]);
    await expect(areas.findExistingIds([AREA_IDS.operaciones])).resolves.toEqual([
      AREA_IDS.operaciones,
    ]);
  });
});

describe('InMemoryUsersDirectory', () => {
  it('findById de un fixture devuelve su rol y sus áreas', async () => {
    const users = new InMemoryUsersDirectory();

    await expect(
      users.findById(FIXTURE_USERS.empleadoVentas.id),
    ).resolves.toEqual({
      id: FIXTURE_USERS.empleadoVentas.id,
      name: 'Elena Empleada de Ventas',
      role: 'EMPLOYEE',
      isActive: true,
      areaIds: [AREA_IDS.ventas],
    });
  });

  it('findById de un id desconocido devuelve null', async () => {
    const users = new InMemoryUsersDirectory();

    await expect(users.findById(UNKNOWN_ID)).resolves.toBeNull();
  });

  it('se puede construir con datos propios del test', async () => {
    const propio = {
      id: UNKNOWN_ID,
      name: 'Responsable histórico de prueba',
      role: 'SUPERVISOR' as const,
      areaIds: [],
      isActive: false,
    };
    const users = new InMemoryUsersDirectory([propio]);

    await expect(users.findById(UNKNOWN_ID)).resolves.toEqual(propio);
    await expect(users.findById(FIXTURE_USERS.admin.id)).resolves.toBeNull();
  });
});

describe('fixtures', () => {
  it('usan UUID fijos con formato válido', () => {
    const ids = [
      ...Object.values(AREA_IDS),
      ...Object.values(FIXTURE_USERS).map((user) => user.id),
    ];

    ids.forEach((id) => expect(id).toMatch(UUID));
  });
});
