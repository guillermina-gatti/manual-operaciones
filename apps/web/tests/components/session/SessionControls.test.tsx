import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { SessionControls } from '@/components/session/SessionControls';

const mocks = vi.hoisted(() => ({
  logoutSession: vi.fn(),
  useSession: vi.fn(),
  replace: vi.fn(),
  listConflictAlerts: vi.fn(),
  pathname: '/',
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace }),
  usePathname: () => mocks.pathname,
}));
vi.mock('@/lib/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/session')>()),
  REAL_AUTH_ENABLED: true,
  useSession: mocks.useSession,
}));
vi.mock('@/lib/session/real-session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/session/real-session')>()),
  logoutSession: mocks.logoutSession,
}));
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  listConflictAlerts: mocks.listConflictAlerts,
}));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.logoutSession.mockResolvedValue(undefined);
  mocks.listConflictAlerts.mockResolvedValue({ data: [], total: 0, openTotal: 0, page: 1, limit: 1 });
  mocks.useSession.mockReturnValue({
    user: { id: 'id', name: 'Ada Lovelace', role: 'ADMIN' }, status: 'ready',
  });
});

describe('A-09: estado de sesión en encabezado', () => {
  test('muestra nombre del usuario real y permite cerrar sesión', () => {
    render(<SessionControls />);
    expect(screen.getByText(/Ada Lovelace/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cerrar sesión' })).toBeInTheDocument();
  });

  test('logout exitoso redirige al login', async () => {
    const user = userEvent.setup();
    render(<SessionControls />);
    await user.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
    await waitFor(() => expect(mocks.logoutSession).toHaveBeenCalledTimes(1));
    expect(mocks.replace).toHaveBeenCalledWith('/login');
  });

  test('si falla la revocación avisa, sin afirmar cierre remoto', async () => {
    const user = userEvent.setup();
    mocks.logoutSession.mockRejectedValueOnce(new Error('sin red'));
    render(<SessionControls />);
    await user.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('no pudimos confirmar el cierre en el servidor');
  });

  test('sin sesión ofrece ingreso', () => {
    mocks.useSession.mockReturnValue({ user: null, status: 'ready' });
    render(<SessionControls />);
    expect(screen.getByRole('link', { name: 'Iniciar sesión' })).toHaveAttribute('href', '/login');
  });

  describe('navegación de Asistente y Alertas (spec 009 y spec 011)', () => {
    test('con sesión activa, cualquier rol ve el enlace a /asistente', () => {
      mocks.useSession.mockReturnValue({
        user: { id: 'emp-1', name: 'Elena', role: 'EMPLOYEE' },
        status: 'ready',
      });
      render(<SessionControls />);
      expect(screen.getByRole('link', { name: 'Asistente' })).toHaveAttribute('href', '/asistente');
      expect(screen.queryByRole('link', { name: 'Alertas' })).not.toBeInTheDocument();
    });

    test('un SUPERVISOR ve Asistente pero no ve Alertas', () => {
      mocks.useSession.mockReturnValue({
        user: { id: 'sup-1', name: 'Sergio', role: 'SUPERVISOR' },
        status: 'ready',
      });
      render(<SessionControls />);
      expect(screen.getByRole('link', { name: 'Asistente' })).toHaveAttribute('href', '/asistente');
      expect(screen.queryByRole('link', { name: 'Alertas' })).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Invitar usuario' })).not.toBeInTheDocument();
    });

    test('un ADMIN ve Asistente y además el enlace a /documentos/alertas sin badge si no hay alertas', async () => {
      mocks.listConflictAlerts.mockResolvedValueOnce({
        data: [],
        total: 0,
        openTotal: 0,
        page: 1,
        limit: 1,
      });
      mocks.useSession.mockReturnValue({
        user: { id: 'adm-1', name: 'Ana', role: 'ADMIN' },
        status: 'ready',
      });
      render(<SessionControls />);
      expect(screen.getByRole('link', { name: 'Asistente' })).toHaveAttribute('href', '/asistente');
      expect(screen.getByRole('link', { name: 'Invitar usuario' })).toHaveAttribute('href', '/admin/invitaciones');
      const alertsLink = await screen.findByRole('link', { name: 'Alertas: ninguna abierta' });
      expect(alertsLink).toHaveAttribute('href', '/documentos/alertas');
      expect(screen.queryByTestId('alerts-badge')).not.toBeInTheDocument();
    });

    test('un ADMIN ve el badge con la cantidad de alertas abiertas', async () => {
      mocks.listConflictAlerts.mockResolvedValueOnce({
        data: [],
        total: 3,
        openTotal: 3,
        page: 1,
        limit: 1,
      });
      mocks.useSession.mockReturnValue({
        user: { id: 'adm-1', name: 'Ana', role: 'ADMIN' },
        status: 'ready',
      });
      render(<SessionControls />);
      const alertsLink = await screen.findByRole('link', { name: 'Alertas: 3 abiertas' });
      expect(alertsLink).toHaveAttribute('href', '/documentos/alertas');
      const badge = screen.getByTestId('alerts-badge');
      expect(badge).toHaveTextContent('3');
    });

    test('sin sesión no muestra ni Asistente ni Alertas', () => {
      mocks.useSession.mockReturnValue({ user: null, status: 'ready' });
      render(<SessionControls />);
      expect(screen.queryByRole('link', { name: 'Asistente' })).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Alertas' })).not.toBeInTheDocument();
    });

    test('actualiza el badge cuando se resuelve una alerta (evento CONFLICT_ALERTS_CHANGED_EVENT)', async () => {
      mocks.listConflictAlerts
        .mockResolvedValueOnce({ data: [], total: 3, openTotal: 3, page: 1, limit: 1 })
        .mockResolvedValueOnce({ data: [], total: 0, openTotal: 0, page: 1, limit: 1 });
      mocks.useSession.mockReturnValue({
        user: { id: 'adm-1', name: 'Ana', role: 'ADMIN' },
        status: 'ready',
      });
      render(<SessionControls />);
      const badge = await screen.findByTestId('alerts-badge');
      expect(badge).toHaveTextContent('3');

      window.dispatchEvent(new CustomEvent('conflict-alerts:changed'));

      await waitFor(() => {
        expect(screen.getByRole('link', { name: 'Alertas: ninguna abierta' })).toBeInTheDocument();
      });
      expect(screen.queryByTestId('alerts-badge')).not.toBeInTheDocument();
      expect(mocks.listConflictAlerts).toHaveBeenCalledTimes(2);
    });

    test('actualiza el badge al navegar entre pantallas', async () => {
      mocks.listConflictAlerts
        .mockResolvedValueOnce({ data: [], total: 3, openTotal: 3, page: 1, limit: 1 })
        .mockResolvedValueOnce({ data: [], total: 0, openTotal: 0, page: 1, limit: 1 });
      mocks.useSession.mockReturnValue({
        user: { id: 'adm-1', name: 'Ana', role: 'ADMIN' },
        status: 'ready',
      });
      mocks.pathname = '/documentos/alertas';
      const { rerender } = render(<SessionControls />);
      const badge = await screen.findByTestId('alerts-badge');
      expect(badge).toHaveTextContent('3');

      mocks.pathname = '/documentos';
      rerender(<SessionControls />);

      await waitFor(() => {
        expect(screen.getByRole('link', { name: 'Alertas: ninguna abierta' })).toBeInTheDocument();
      });
      expect(screen.queryByTestId('alerts-badge')).not.toBeInTheDocument();
      expect(mocks.listConflictAlerts).toHaveBeenCalledTimes(2);
    });
  });
});
