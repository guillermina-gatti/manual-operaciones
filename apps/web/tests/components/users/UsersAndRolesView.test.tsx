import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test } from 'vitest';
import { UsersAndRolesView } from '@/components/users/UsersAndRolesView';
import { FIXTURE_USERS } from '@/lib/directory/fixtures';
import type { SessionUser } from '@/lib/session';

describe('UsersAndRolesView component', () => {
  test('para SUPERVISOR muestra únicamente a los usuarios a su cargo y no muestra botón de invitar', () => {
    const supervisor: SessionUser = {
      id: FIXTURE_USERS.supervisorVentas.id,
      name: 'Sergio Supervisor de Ventas',
      role: 'SUPERVISOR',
    };

    render(<UsersAndRolesView user={supervisor} />);

    expect(screen.getByRole('heading', { level: 1, name: 'Usuarios y roles a cargo' })).toBeInTheDocument();
    expect(screen.getByText('Elena Empleada de Ventas')).toBeInTheDocument();
    expect(screen.queryByText('Emilio Empleado de Operaciones')).not.toBeInTheDocument();
    expect(screen.queryByText('Sofía Supervisora de Operaciones')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Invitar/ })).not.toBeInTheDocument();
  });

  test('para ADMIN muestra a todo el personal a cargo y el botón para invitar nuevo usuario', () => {
    const admin: SessionUser = {
      id: FIXTURE_USERS.admin.id,
      name: 'Ana Administradora',
      role: 'ADMIN',
    };

    render(<UsersAndRolesView user={admin} />);

    expect(screen.getByText('Elena Empleada de Ventas')).toBeInTheDocument();
    expect(screen.getByText('Sergio Supervisor de Ventas')).toBeInTheDocument();
    expect(screen.getByText('Sofía Supervisora de Operaciones')).toBeInTheDocument();
    expect(screen.getByText('Emilio Empleado de Operaciones')).toBeInTheDocument();

    const inviteLink = screen.getByRole('link', { name: 'Invitar nuevo usuario' });
    expect(inviteLink).toHaveAttribute('href', '/admin/invitaciones');
  });

  test('permite filtrar por término de búsqueda', async () => {
    const admin: SessionUser = {
      id: FIXTURE_USERS.admin.id,
      name: 'Ana Administradora',
      role: 'ADMIN',
    };
    const userActor = userEvent.setup();

    render(<UsersAndRolesView user={admin} />);

    const searchInput = screen.getByRole('textbox', { name: 'Buscar usuarios a cargo' });
    await userActor.type(searchInput, 'Elena');

    expect(screen.getByText('Elena Empleada de Ventas')).toBeInTheDocument();
    expect(screen.queryByText('Emilio Empleado de Operaciones')).not.toBeInTheDocument();
    expect(screen.queryByText('Sergio Supervisor de Ventas')).not.toBeInTheDocument();
  });
});
