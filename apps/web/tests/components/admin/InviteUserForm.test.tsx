import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { ApiError } from '@/lib/api/api-error';
import { InviteUserForm } from '@/components/admin/InviteUserForm';

const mocks = vi.hoisted(() => ({
  createInvitation: vi.fn(),
  listAreas: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  createInvitation: mocks.createInvitation,
  notifyInvitationsChanged: vi.fn(),
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

beforeEach(() => {
  vi.resetAllMocks();
  mocks.listAreas.mockResolvedValue(sampleAreas);
  mocks.createInvitation.mockResolvedValue({
    id: 'inv-uuid',
    email: 'carla@empresa.com',
    role: 'EMPLOYEE',
    areaIds: ['area-1'],
    expiresAt: '2026-11-13T12:00:00Z',
    createdAt: '2026-11-11T12:00:00Z',
    invitationUrl: 'http://localhost:3001/registro#token=test-token',
  });
});

describe('InviteUserForm — Emisión de invitaciones por ADMIN', () => {
  test('renderiza campos del formulario y selecciona la primer área por defecto', async () => {
    render(<InviteUserForm />);

    expect(screen.getByRole('textbox', { name: /correo electrónico/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /empleado/i })).toBeChecked();

    await waitFor(() => {
      expect(screen.getByLabelText('Ventas')).toBeChecked();
    });
    expect(screen.getByLabelText('Operaciones')).not.toBeChecked();
  });

  test('al seleccionar rol Admin oculta los checkboxes de áreas y muestra aclaración de acceso global', async () => {
    const user = userEvent.setup();
    render(<InviteUserForm />);

    await waitFor(() => expect(screen.getByLabelText('Ventas')).toBeInTheDocument());

    await user.click(screen.getByRole('radio', { name: /admin/i }));
    expect(screen.queryByLabelText('Ventas')).not.toBeInTheDocument();
    expect(screen.getByText(/Acceso global sin restricción de áreas/i)).toBeInTheDocument();

    await user.type(screen.getByRole('textbox', { name: /correo electrónico/i }), 'admin2@empresa.com');
    await user.click(screen.getByRole('button', { name: /enviar invitación/i }));

    await waitFor(() => {
      expect(mocks.createInvitation).toHaveBeenCalledWith({
        email: 'admin2@empresa.com',
        role: 'ADMIN',
        areaIds: [],
      });
    });
  });

  test('permite enviar invitación a Empleado con áreas y muestra el estado de éxito con enlace', async () => {
    const user = userEvent.setup();
    render(<InviteUserForm />);

    await waitFor(() => expect(screen.getByLabelText('Ventas')).toBeInTheDocument());

    await user.type(screen.getByRole('textbox', { name: /correo electrónico/i }), 'carla@empresa.com');
    await user.click(screen.getByRole('button', { name: /enviar invitación/i }));

    await waitFor(() => {
      expect(mocks.createInvitation).toHaveBeenCalledWith({
        email: 'carla@empresa.com',
        role: 'EMPLOYEE',
        areaIds: ['area-1'],
      });
    });

    expect(await screen.findByText('¡Invitación emitida con éxito!')).toBeInTheDocument();
    expect(screen.getByText('carla@empresa.com')).toBeInTheDocument();
    expect(screen.getByDisplayValue('http://localhost:3001/registro#token=test-token')).toBeInTheDocument();
  });

  test('muestra error si la API responde 409 Conflict', async () => {
    const user = userEvent.setup();
    mocks.createInvitation.mockRejectedValueOnce(new ApiError(409));

    render(<InviteUserForm />);
    await waitFor(() => expect(screen.getByLabelText('Ventas')).toBeInTheDocument());

    await user.type(screen.getByRole('textbox', { name: /correo electrónico/i }), 'existente@empresa.com');
    await user.click(screen.getByRole('button', { name: /enviar invitación/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Ya existe un usuario registrado con este correo o una invitación pendiente vigente.',
    );
  });

  test('permite reiniciar el formulario para invitar a otra persona', async () => {
    const user = userEvent.setup();
    render(<InviteUserForm />);

    await waitFor(() => expect(screen.getByLabelText('Ventas')).toBeInTheDocument());
    await user.type(screen.getByRole('textbox', { name: /correo electrónico/i }), 'carla@empresa.com');
    await user.click(screen.getByRole('button', { name: /enviar invitación/i }));

    const resetButton = await screen.findByRole('button', { name: /invitar a otra persona/i });
    await user.click(resetButton);

    expect(screen.getByRole('textbox', { name: /correo electrónico/i })).toHaveValue('');
    expect(screen.getByRole('radio', { name: /empleado/i })).toBeChecked();
  });
});
