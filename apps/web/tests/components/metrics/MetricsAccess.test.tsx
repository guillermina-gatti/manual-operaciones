import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { MetricsAccess } from '@/components/metrics/MetricsAccess';
import type { Role } from '@/lib/session';

const mocks = vi.hoisted(() => ({ useSession: vi.fn() }));

vi.mock('@/lib/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/session')>()),
  useSession: mocks.useSession,
}));

const as = (role: Role) => ({
  user: { id: '0b000000-0000-4000-8000-000000000001', name: role, role },
  status: 'ready',
});

const panel = () => (
  <MetricsAccess>
    <p>Panel</p>
  </MetricsAccess>
);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('MetricsAccess', () => {
  test.each<Role>(['ADMIN', 'SUPERVISOR'])('%s sees the panel', (role) => {
    mocks.useSession.mockReturnValue(as(role));
    render(panel());

    expect(screen.getByText('Panel')).toBeInTheDocument();
  });

  test('EMPLOYEE does not even mount the panel, and gets a way out', () => {
    mocks.useSession.mockReturnValue(as('EMPLOYEE'));
    render(panel());

    expect(screen.queryByText('Panel')).not.toBeInTheDocument();
    expect(
      screen.getByText('Solo los administradores y los supervisores pueden ver las métricas.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ir a ejecutar procedimientos' })).toHaveAttribute(
      'href',
      '/ejecuciones',
    );
  });

  test('while the session loads, nothing is mounted', () => {
    mocks.useSession.mockReturnValue({ user: null, status: 'loading' });
    render(panel());

    expect(screen.queryByText('Panel')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  test('without a user, asks to choose one', () => {
    mocks.useSession.mockReturnValue({ user: null, status: 'ready' });
    render(panel());

    expect(screen.getByText('Elegí un usuario de prueba')).toBeInTheDocument();
  });

  test('with the simulated session disabled, says the session is not valid', () => {
    mocks.useSession.mockReturnValue({ user: null, status: 'disabled' });
    render(panel());

    expect(screen.getByRole('alert')).toHaveTextContent('Tu sesión no es válida. Volvé a ingresar.');
  });
});
