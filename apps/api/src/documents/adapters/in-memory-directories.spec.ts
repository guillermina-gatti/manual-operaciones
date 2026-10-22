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
});

describe('InMemoryUsersDirectory', () => {
  it('findById de un fixture devuelve su rol y sus áreas', async () => {
    const users = new InMemoryUsersDirectory();

    await expect(
      users.findById(FIXTURE_USERS.empleadoVentas.id),
    ).resolves.toEqual({
      id: FIXTURE_USERS.empleadoVentas.id,
      role: 'EMPLOYEE',
      areaIds: [AREA_IDS.ventas],
    });
  });

  it('findById de un id desconocido devuelve null', async () => {
    const users = new InMemoryUsersDirectory();

    await expect(users.findById(UNKNOWN_ID)).resolves.toBeNull();
  });

  it('se puede construir con datos propios del test', async () => {
    const propio = { id: UNKNOWN_ID, role: 'SUPERVISOR' as const, areaIds: [] };
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
