import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { InvitationsHistoryTable } from '@/components/admin/InvitationsHistoryTable';
import type { InvitationListItem } from '@/lib/api';

const mocks = vi.hoisted(() => ({
  listInvitations: vi.fn(),
  revokeInvitation: vi.fn(),
}));

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  listInvitations: mocks.listInvitations,
  revokeInvitation: mocks.revokeInvitation,
}));

const SAMPLE_ITEMS: InvitationListItem[] = [
  {
    id: 'inv-1',
    email: 'pendiente@empresa.com',
    role: 'EMPLOYEE',
    status: 'PENDING',
    areaIds: ['a1'],
    areaNames: ['Ventas'],
    createdAt: '2026-11-12T10:00:00.000Z',
    expiresAt: '2026-11-14T10:00:00.000Z',
    acceptedAt: null,
    revokedAt: null,
    createdBy: { id: 'adm-1', name: 'Ana Administradora' },
  },
  {
    id: 'inv-2',
    email: 'aceptado@empresa.com',
    role: 'SUPERVISOR',
    status: 'ACCEPTED',
    areaIds: ['a2'],
    areaNames: ['Operaciones'],
    createdAt: '2026-11-10T10:00:00.000Z',
    expiresAt: '2026-11-12T10:00:00.000Z',
    acceptedAt: '2026-11-11T12:00:00.000Z',
    revokedAt: null,
    createdBy: { id: 'adm-1', name: 'Ana Administradora' },
  },
  {
    id: 'inv-3',
    email: 'revocada@empresa.com',
    role: 'EMPLOYEE',
    status: 'REVOKED',
    areaIds: ['a1'],
    areaNames: ['Ventas'],
    createdAt: '2026-11-09T10:00:00.000Z',
    expiresAt: '2026-11-11T10:00:00.000Z',
    acceptedAt: null,
    revokedAt: '2026-11-09T15:00:00.000Z',
    createdBy: { id: 'adm-1', name: 'Ana Administradora' },
  },
];

describe('InvitationsHistoryTable component', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.listInvitations.mockResolvedValue(SAMPLE_ITEMS);
    mocks.revokeInvitation.mockResolvedValue({ id: 'inv-1', revoked: true });
  });

  test('muestra la lista de invitaciones con correos, roles, áreas y badges de estado', async () => {
    render(<InvitationsHistoryTable />);

    expect(await screen.findByText('pendiente@empresa.com')).toBeInTheDocument();
    expect(screen.getByText('aceptado@empresa.com')).toBeInTheDocument();
    expect(screen.getByText('revocada@empresa.com')).toBeInTheDocument();

    expect(screen.getByText('Pendiente')).toBeInTheDocument();
    expect(screen.getByText('Aceptada')).toBeInTheDocument();
    expect(screen.getByText('Revocada')).toBeInTheDocument();
  });

  test('permite filtrar por estado usando los botones de filtro', async () => {
    const user = userEvent.setup();
    render(<InvitationsHistoryTable />);

    expect(await screen.findByText('pendiente@empresa.com')).toBeInTheDocument();

    // Filtrar solo Pendientes
    const pendingButton = screen.getByRole('button', { name: /Pendientes/ });
    await user.click(pendingButton);

    expect(screen.getByText('pendiente@empresa.com')).toBeInTheDocument();
    expect(screen.queryByText('aceptado@empresa.com')).not.toBeInTheDocument();
    expect(screen.queryByText('revocada@empresa.com')).not.toBeInTheDocument();
  });

  test('permite buscar por texto de correo', async () => {
    const user = userEvent.setup();
    render(<InvitationsHistoryTable />);

    expect(await screen.findByText('pendiente@empresa.com')).toBeInTheDocument();

    const searchInput = screen.getByRole('textbox', { name: 'Buscar invitación' });
    await user.type(searchInput, 'aceptado');

    expect(screen.getByText('aceptado@empresa.com')).toBeInTheDocument();
    expect(screen.queryByText('pendiente@empresa.com')).not.toBeInTheDocument();
  });

  test('permite revocar una invitación pendiente tras confirmación', async () => {
    const user = userEvent.setup();
    render(<InvitationsHistoryTable />);

    expect(await screen.findByText('pendiente@empresa.com')).toBeInTheDocument();

    const revokeBtn = screen.getByRole('button', {
      name: 'Revocar invitación para pendiente@empresa.com',
    });
    await user.click(revokeBtn);

    // Debe mostrar la confirmación
    expect(screen.getByText('¿Revocar?')).toBeInTheDocument();
    const confirmBtn = screen.getByRole('button', { name: 'Sí' });

    await user.click(confirmBtn);

    await waitFor(() => {
      expect(mocks.revokeInvitation).toHaveBeenCalledWith('inv-1');
    });
  });

  test('muestra mensaje cuando no hay invitaciones', async () => {
    mocks.listInvitations.mockResolvedValueOnce([]);
    render(<InvitationsHistoryTable />);

    expect(
      await screen.findByText('Todavía no se emitieron invitaciones en el sistema.'),
    ).toBeInTheDocument();
  });
});
