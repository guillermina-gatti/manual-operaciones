import { RepositoryUnavailableError } from '../documents/documents.repository';
import { AREA_IDS, FIXTURE_USERS } from '../documents/adapters/fixtures';
import type { DirectoryUser, UsersDirectory } from '../documents/ports/users-directory';
import type { AuthUser } from '../common/auth';
import { procedureViewerFor } from './procedure-viewer';

const { ventas, operaciones } = AREA_IDS;

// What the guard leaves in request.user: the role and the areas that are still active.
const session = (role: AuthUser['role'], areaIds: string[]): AuthUser => ({
  id: FIXTURE_USERS.empleadoVentas.id,
  email: 'elena@fixtures.test',
  name: 'Elena',
  role,
  areaIds,
});

const entry = (overrides: Partial<DirectoryUser> = {}): DirectoryUser => ({
  ...FIXTURE_USERS.empleadoVentas,
  ...overrides,
});

describe('procedureViewerFor (spec 006, R15 and P20)', () => {
  let users: { findById: jest.Mock };

  beforeEach(() => {
    users = { findById: jest.fn() };
  });

  const viewerFor = (user: AuthUser) => procedureViewerFor(users as unknown as UsersDirectory, user);

  it('an ADMIN does not need areas and the directory is not asked', async () => {
    const viewer = await viewerFor(session('ADMIN', []));

    expect(viewer).toEqual({ role: 'ADMIN', areaIds: [] });
    expect(users.findById).not.toHaveBeenCalled();
  });

  it('the areas are the ones of the directory that the session still has active', async () => {
    users.findById.mockResolvedValue(entry({ areaIds: [ventas, operaciones] }));

    const viewer = await viewerFor(session('EMPLOYEE', [ventas]));

    expect(viewer).toEqual({ role: 'EMPLOYEE', areaIds: [ventas] });
  });

  it('E39: an area that is no longer active in the session does not give access', async () => {
    users.findById.mockResolvedValue(entry({ areaIds: [ventas] }));

    const viewer = await viewerFor(session('EMPLOYEE', []));

    expect(viewer.areaIds).toEqual([]);
  });

  it('an area of the session that the directory no longer has does not give access', async () => {
    users.findById.mockResolvedValue(entry({ areaIds: [] }));

    const viewer = await viewerFor(session('SUPERVISOR', [ventas]));

    expect(viewer.areaIds).toEqual([]);
  });

  it('E24: a user the directory does not know has no areas', async () => {
    users.findById.mockResolvedValue(null);

    const viewer = await viewerFor(session('EMPLOYEE', [ventas]));

    expect(viewer.areaIds).toEqual([]);
  });

  it('E40: an inactive user has no areas', async () => {
    users.findById.mockResolvedValue(entry({ isActive: false, areaIds: [ventas] }));

    const viewer = await viewerFor(session('EMPLOYEE', [ventas]));

    expect(viewer.areaIds).toEqual([]);
  });

  it('E25: if the directory fails, the error goes up and nothing is granted', async () => {
    users.findById.mockRejectedValue(new RepositoryUnavailableError('directorio caído'));

    await expect(viewerFor(session('EMPLOYEE', [ventas]))).rejects.toBeInstanceOf(RepositoryUnavailableError);
  });
});
