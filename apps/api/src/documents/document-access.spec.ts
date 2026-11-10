import type { AuthUser } from '../common/auth';
import { AREA_IDS, FIXTURE_USERS } from './adapters/fixtures';
import { InMemoryUsersDirectory } from './adapters/in-memory-users-directory';
import { viewerFor } from './document-access';
import { canView, listWhere, searchScope } from './document-access.policy';

const VENTAS = AREA_IDS.ventas;
const OPERACIONES = AREA_IDS.operaciones;

// Simula el usuario autenticado por JwtAuthGuard.
// Sus areaIds contienen solamente áreas activas.
function authenticatedUser(
  areaIds: string[],
  role: AuthUser['role'] = 'EMPLOYEE',
): AuthUser {
  return {
    id: FIXTURE_USERS.empleadoVentas.id,
    name: FIXTURE_USERS.empleadoVentas.name,
    email: 'empleado@example.test',
    role,
    areaIds,
  };
}

// Simula el directorio histórico, que conserva vínculos
// incluso cuando el área fue desactivada.
function historicalDirectory(
  areaIds: string[],
  role: AuthUser['role'] = 'EMPLOYEE',
): InMemoryUsersDirectory {
  return new InMemoryUsersDirectory([
    {
      ...FIXTURE_USERS.empleadoVentas,
      role,
      areaIds,
    },
  ]);
}

describe('A-SEC.2 - autorizacion con areas inactivas', () => {
  it('EMPLOYEE no obtiene acceso por un area inactiva', async () => {
    const users = historicalDirectory([OPERACIONES]);
    const user = authenticatedUser([]);

    const viewer = await viewerFor(users, user);

    expect(viewer.areaIds).toEqual([]);
    expect(
      canView(viewer, {
        status: 'ACTIVE',
        areaIds: [OPERACIONES],
      }),
    ).toBe(false);
  });

  it('SUPERVISOR tampoco obtiene acceso por un area inactiva', async () => {
    const users = historicalDirectory([OPERACIONES], 'SUPERVISOR');
    const user = authenticatedUser([], 'SUPERVISOR');

    const viewer = await viewerFor(users, user);

    expect(viewer.areaIds).toEqual([]);
    expect(
      canView(viewer, {
        status: 'ACTIVE',
        areaIds: [OPERACIONES],
      }),
    ).toBe(false);
  });

  it('conserva el acceso por el area activa y excluye la inactiva', async () => {
    const users = historicalDirectory([VENTAS, OPERACIONES]);

    // El guard verificó que solamente Ventas está activa.
    const user = authenticatedUser([VENTAS]);

    const viewer = await viewerFor(users, user);

    expect(viewer.areaIds).toEqual([VENTAS]);

    expect(
      canView(viewer, {
        status: 'ACTIVE',
        areaIds: [VENTAS],
      }),
    ).toBe(true);

    expect(
      canView(viewer, {
        status: 'ACTIVE',
        areaIds: [OPERACIONES],
      }),
    ).toBe(false);
  });

  it('listado y busqueda utilizan solamente areas activas autorizadas', async () => {
    const users = historicalDirectory([VENTAS, OPERACIONES]);
    const user = authenticatedUser([VENTAS]);

    const viewer = await viewerFor(users, user);

    expect(listWhere(viewer)).toEqual({
      status: 'ACTIVE',
      areas: {
        some: {
          areaId: { in: [VENTAS] },
        },
      },
    });

    expect(searchScope(viewer)).toEqual({
      areaIds: [VENTAS],
    });
  });

  it('ADMIN conserva acceso global sin consultar sus areas historicas', async () => {
    const users = historicalDirectory([OPERACIONES]);
    const findById = jest.spyOn(users, 'findById');

    const user = authenticatedUser([], 'ADMIN');
    const viewer = await viewerFor(users, user);

    expect(viewer).toEqual({
      role: 'ADMIN',
      areaIds: [],
    });

    expect(findById).not.toHaveBeenCalled();

    expect(
      canView(viewer, {
        status: 'ARCHIVED',
        areaIds: [OPERACIONES],
      }),
    ).toBe(true);
  });
});
