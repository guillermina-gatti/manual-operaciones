import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { ApiError } from '@/lib/api/api-error';
import { EditUserModal } from '@/components/users/EditUserModal';

const mocks = vi.hoisted(() => ({
  updateUser: vi.fn(),
  listAreas: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  updateUser: mocks.updateUser,
  notifyUsersChanged: vi.fn(),
}));

vi.mock('@/lib/directory', () => ({
  areasDirectory: {
    listAreas: mocks.listAreas,
  },
  displayAreaName: (area: { name: string; isActive?: boolean }) =>
    area.isActive === false ? `${area.name} (inactiva)` : area.name,
}));

const sampleAreas = [
  { id: 'area-1', name: 'Ventas', isActive: true },
  { id: 'area-2', name: 'Operaciones', isActive: true },
];

const sampleUser = {
  id: 'user-1',
  name: 'Elena Empleada',
  email: 'elena@empresa.com',
  role: 'EMPLOYEE' as const,
  isActive: true,
  areaIds: ['area-1'],
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.listAreas.mockResolvedValue(sampleAreas);
});

describe('EditUserModal component', () => {
  test('no renderiza nada si isOpen es false o user es null', () => {
    const { container } = render(
      <EditUserModal
        user={sampleUser}
        currentAdminId="admin-uuid"
        isOpen={false}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  test('renderiza modal con datos del usuario a editar', async () => {
    render(
      <EditUserModal
        user={sampleUser}
        currentAdminId="admin-uuid"
        isOpen={true}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );

    expect(screen.getByRole('heading', { level: 2, name: 'Editar usuario' })).toBeInTheDocument();
    expect(screen.getByText('Elena Empleada')).toBeInTheDocument();
    expect(screen.getByText('elena@empresa.com')).toBeInTheDocument();
    expect(screen.getByLabelText('Rol en el sistema')).toHaveValue('EMPLOYEE');
    expect(screen.getByRole('switch', { name: 'Estado de cuenta activa' })).toBeChecked();
  });

  test('impide la autodesactivación y auto-remoción de rol si el usuario es el propio admin', () => {
    const adminUser = {
      id: 'admin-uuid',
      name: 'Ana Administradora',
      email: 'ana@empresa.com',
      role: 'ADMIN' as const,
      isActive: true,
      areaIds: [],
    };

    render(
      <EditUserModal
        user={adminUser}
        currentAdminId="admin-uuid"
        isOpen={true}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );

    const roleSelect = screen.getByLabelText('Rol en el sistema');
    expect(roleSelect).toBeDisabled();
    expect(screen.getByText('No podés modificar tu propio rol de administrador.')).toBeInTheDocument();

    const activeSwitch = screen.getByRole('switch', { name: 'Estado de cuenta activa' });
    expect(activeSwitch).toBeDisabled();
    expect(screen.getByText('No podés desactivar tu propia cuenta de administrador.')).toBeInTheDocument();
  });

  test('permite modificar rol y áreas, enviando la solicitud a updateUser', async () => {
    const userActor = userEvent.setup();
    const onSuccess = vi.fn();
    const onClose = vi.fn();

    mocks.updateUser.mockResolvedValueOnce({
      id: 'user-1',
      name: 'Elena Empleada',
      email: 'elena@empresa.com',
      role: 'SUPERVISOR',
      isActive: true,
      areas: [{ id: 'area-1', name: 'Ventas' }, { id: 'area-2', name: 'Operaciones' }],
      createdAt: '2026-11-12T00:00:00.000Z',
    });

    render(
      <EditUserModal
        user={sampleUser}
        currentAdminId="admin-uuid"
        isOpen={true}
        onClose={onClose}
        onSuccess={onSuccess}
      />,
    );

    // Cambiar rol a SUPERVISOR
    const roleSelect = screen.getByLabelText('Rol en el sistema');
    await userActor.selectOptions(roleSelect, 'SUPERVISOR');

    // Marcar la segunda área
    await waitFor(() => {
      expect(screen.getByLabelText('Operaciones')).toBeInTheDocument();
    });
    await userActor.click(screen.getByLabelText('Operaciones'));

    // Guardar cambios
    await userActor.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => {
      expect(mocks.updateUser).toHaveBeenCalledWith('user-1', {
        role: 'SUPERVISOR',
        areaIds: ['area-1', 'area-2'],
        isActive: true,
      });
      expect(onSuccess).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });
  });

  test('muestra mensaje de error si el servicio API rechaza la actualización', async () => {
    const userActor = userEvent.setup();
    mocks.updateUser.mockRejectedValueOnce(
      new ApiError(409, ['No se puede desactivar ni modificar el rol del único administrador activo del sistema']),
    );

    render(
      <EditUserModal
        user={sampleUser}
        currentAdminId="admin-uuid"
        isOpen={true}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );

    await userActor.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'No se puede desactivar ni modificar el rol del único administrador activo del sistema',
      );
    });
  });
});
