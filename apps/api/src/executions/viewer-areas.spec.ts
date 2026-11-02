import { AREA_IDS, FIXTURE_USERS } from '../documents/adapters/fixtures';
import { InMemoryAreasDirectory } from '../documents/adapters/in-memory-areas-directory';
import { InMemoryUsersDirectory } from '../documents/adapters/in-memory-users-directory';
import { activeAreaIdsOf } from './viewer-areas';

const VENTAS = { id: AREA_IDS.ventas, name: 'Ventas', isActive: true };
const OPERACIONES = {
  id: AREA_IDS.operaciones,
  name: 'Operaciones',
  isActive: true,
};
const UNKNOWN_ID = '1f000000-0000-4000-8000-000000000099';

describe('activeAreaIdsOf', () => {
  const twoAreasEmployee = {
    ...FIXTURE_USERS.empleadoVentas,
    areaIds: [AREA_IDS.ventas, AREA_IDS.operaciones],
  };

  it('returns the areas of the user that are active', async () => {
    const result = await activeAreaIdsOf(
      new InMemoryUsersDirectory([twoAreasEmployee]),
      new InMemoryAreasDirectory([VENTAS, OPERACIONES]),
      twoAreasEmployee.id,
    );

    expect(result).toEqual([AREA_IDS.ventas, AREA_IDS.operaciones]);
  });

  it('leaves out a deactivated area, keeping the others', async () => {
    const result = await activeAreaIdsOf(
      new InMemoryUsersDirectory([twoAreasEmployee]),
      new InMemoryAreasDirectory([{ ...VENTAS, isActive: false }, OPERACIONES]),
      twoAreasEmployee.id,
    );

    expect(result).toEqual([AREA_IDS.operaciones]);
  });

  it('leaves out an area the directory does not know', async () => {
    const result = await activeAreaIdsOf(
      new InMemoryUsersDirectory([twoAreasEmployee]),
      new InMemoryAreasDirectory([OPERACIONES]),
      twoAreasEmployee.id,
    );

    expect(result).toEqual([AREA_IDS.operaciones]);
  });

  it('a user the directory does not know has no areas', async () => {
    const result = await activeAreaIdsOf(
      new InMemoryUsersDirectory([]),
      new InMemoryAreasDirectory(),
      UNKNOWN_ID,
    );

    expect(result).toEqual([]);
  });

  it('an inactive user has no areas', async () => {
    const result = await activeAreaIdsOf(
      new InMemoryUsersDirectory([{ ...twoAreasEmployee, isActive: false }]),
      new InMemoryAreasDirectory(),
      twoAreasEmployee.id,
    );

    expect(result).toEqual([]);
  });

  it('does not ask for areas when the user has none', async () => {
    const areas = new InMemoryAreasDirectory();
    const findByIds = jest.spyOn(areas, 'findByIds');

    const result = await activeAreaIdsOf(
      new InMemoryUsersDirectory(),
      areas,
      FIXTURE_USERS.admin.id,
    );

    expect(result).toEqual([]);
    expect(findByIds).not.toHaveBeenCalled();
  });
});
