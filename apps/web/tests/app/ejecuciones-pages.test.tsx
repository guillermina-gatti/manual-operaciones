import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import EjecucionesPage from '@/app/ejecuciones/page';
import MiActividadPage from '@/app/ejecuciones/mi-actividad/page';
import type { SessionState } from '@/lib/session';

const mocks = vi.hoisted(() => ({ useSession: vi.fn() }));

vi.mock('@/lib/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/session')>()),
  useSession: mocks.useSession,
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/ejecuciones',
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn() }),
}));

// What each page mounts is tested on its own; here, only who gets to see it.
vi.mock('@/components/executions/ProcedurePicker', () => ({
  ProcedurePicker: () => <p>Selector de procedimientos</p>,
  PickerSkeleton: () => null,
}));
vi.mock('@/components/executions/MyActivityPanel', () => ({
  MyActivityPanel: () => <p>Panel de mi actividad</p>,
  MyActivitySkeleton: () => null,
}));

const as = (role: 'ADMIN' | 'SUPERVISOR' | 'EMPLOYEE'): SessionState => ({
  user: { id: '0b000000-0000-4000-8000-000000000003', name: 'Usuario', role },
  status: 'ready',
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('/ejecuciones', () => {
  test('an employee sees the picker, without the link to their activity (it is on the home page)', () => {
    mocks.useSession.mockReturnValue(as('EMPLOYEE'));
    render(<EjecucionesPage />);

    expect(screen.getByText('Selector de procedimientos')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Ver mi actividad/ })).not.toBeInTheDocument();
  });

  test('another role does not mount the picker', () => {
    mocks.useSession.mockReturnValue(as('SUPERVISOR'));
    render(<EjecucionesPage />);

    expect(screen.queryByText('Selector de procedimientos')).not.toBeInTheDocument();
  });
});

describe('/ejecuciones/mi-actividad', () => {
  test('an employee sees their activity and the way back', () => {
    mocks.useSession.mockReturnValue(as('EMPLOYEE'));
    render(<MiActividadPage />);

    expect(screen.getByRole('heading', { level: 1, name: 'Mi actividad' })).toBeInTheDocument();
    expect(screen.getByText('Panel de mi actividad')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: '← Volver a Ejecutar un procedimiento' }),
    ).toHaveAttribute('href', '/ejecuciones');
  });

  test('the title and subtitle first, then the panel, 26 px apart', () => {
    mocks.useSession.mockReturnValue(as('EMPLOYEE'));
    render(<MiActividadPage />);

    const title = screen.getByRole('heading', { level: 1, name: 'Mi actividad' });
    const panel = screen.getByText('Panel de mi actividad');
    expect(title.compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole('main')).toHaveClass('gap-[26px]');
  });

  test.each(['ADMIN', 'SUPERVISOR'] as const)('%s does not mount the panel', (role) => {
    mocks.useSession.mockReturnValue(as(role));
    render(<MiActividadPage />);

    expect(screen.getByText('Solo los empleados pueden ver su actividad.')).toBeInTheDocument();
    expect(screen.queryByText('Panel de mi actividad')).not.toBeInTheDocument();
  });
});
