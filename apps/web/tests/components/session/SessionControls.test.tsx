import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { SessionControls } from '@/components/session/SessionControls';

const mocks = vi.hoisted(() => ({
  logoutSession: vi.fn(),
  useSession: vi.fn(),
  replace: vi.fn(),
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: mocks.replace }) }));
vi.mock('@/lib/session', () => ({ REAL_AUTH_ENABLED: true, useSession: mocks.useSession }));
vi.mock('@/lib/session/real-session', () => ({ logoutSession: mocks.logoutSession }));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.logoutSession.mockResolvedValue(undefined);
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
});
