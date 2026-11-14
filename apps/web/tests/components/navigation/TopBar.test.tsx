import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { TopBar } from '@/components/navigation/TopBar';

const mocks = vi.hoisted(() => ({
  listConflictAlerts: vi.fn(),
  pathname: '/',
}));

vi.mock('next/navigation', () => ({
  usePathname: () => mocks.pathname,
}));

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  listConflictAlerts: mocks.listConflictAlerts,
}));

describe('TopBar component', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.listConflictAlerts.mockResolvedValue({
      data: [],
      total: 0,
      openTotal: 0,
      page: 1,
      limit: 1,
    });
  });

  test('muestra el perfil del usuario con avatar, nombre y rol al lado de la campana', () => {
    const user = {
      id: 'usr-1',
      name: 'Elena Gómez',
      role: 'EMPLOYEE' as const,
    };
    const onOpenMobileMenu = vi.fn();

    render(<TopBar user={user} onOpenMobileMenu={onOpenMobileMenu} />);

    const profile = screen.getByTestId('topbar-user-profile');
    expect(profile).toBeInTheDocument();
    expect(profile).toHaveTextContent('EG');
    expect(profile).toHaveTextContent('Elena Gómez');
    expect(profile).toHaveTextContent('Empleada · Ventas');
  });

  test('para usuario ADMIN muestra la campana de alertas con su enlace', async () => {
    const user = {
      id: 'adm-1',
      name: 'Ana García',
      role: 'ADMIN' as const,
    };
    render(<TopBar user={user} onOpenMobileMenu={vi.fn()} />);

    const alertsLink = await screen.findByRole('link', { name: /Alertas/ });
    expect(alertsLink).toHaveAttribute('href', '/documentos/alertas');
  });

  test('el botón hamburguesa en móvil invoca onOpenMobileMenu', async () => {
    const user = {
      id: 'emp-1',
      name: 'Elena',
      role: 'EMPLOYEE' as const,
    };
    const onOpenMobileMenu = vi.fn();
    const userActor = userEvent.setup();

    render(<TopBar user={user} onOpenMobileMenu={onOpenMobileMenu} />);

    const menuButton = screen.getByRole('button', { name: 'Abrir menú' });
    await userActor.click(menuButton);

    expect(onOpenMobileMenu).toHaveBeenCalledTimes(1);
  });
});
