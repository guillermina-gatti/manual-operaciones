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

  it('un usuario inactivo no obtiene permisos por sus areas', async () => {
    const users = new InMemoryUsersDirectory([
      {
        ...FIXTURE_USERS.empleadoVentas,
        isActive: false,
        areaIds: [VENTAS],
      },
    ]);

    const viewer = await viewerFor(users, authenticatedUser([VENTAS]));

    expect(viewer.areaIds).toEqual([]);
  });

  it('un usuario inexistente no obtiene permisos', async () => {
    const users = new InMemoryUsersDirectory([]);

    const viewer = await viewerFor(users, authenticatedUser([VENTAS]));

    expect(viewer.areaIds).toEqual([]);
  });

  it('si el directorio falla, el error se propaga sin conceder acceso', async () => {
    const users = historicalDirectory([VENTAS]);
    const error = new Error('Directorio no disponible');

    jest.spyOn(users, 'findById').mockRejectedValue(error);

    await expect(viewerFor(users, authenticatedUser([VENTAS]))).rejects.toBe(
      error,
    );
  });

  it('conserva las asociaciones historicas sin usarlas como permisos', async () => {
    const users = historicalDirectory([VENTAS, OPERACIONES]);

    const historical = await users.findById(FIXTURE_USERS.empleadoVentas.id);

    expect(historical?.areaIds).toEqual([VENTAS, OPERACIONES]);

    const viewer = await viewerFor(users, authenticatedUser([VENTAS]));

    expect(viewer.areaIds).toEqual([VENTAS]);
  });
});
