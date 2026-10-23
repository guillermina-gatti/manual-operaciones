import { render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { RequireRole } from '@/components/session/RequireRole';
import type { Role, SessionState } from '@/lib/session';

const mocks = vi.hoisted(() => ({ useSession: vi.fn(), mounted: vi.fn() }));

vi.mock('@/lib/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/session')>()),
  useSession: mocks.useSession,
}));

// Un contenido que registra si llegó a arrancar: si se monta, corre su efecto.
function Formulario() {
  useEffect(() => {
    mocks.mounted();
  }, []);
  return <p>Formulario de carga</p>;
}

const sessionOf = (role: Role): SessionState => ({
  user: { id: '0b000000-0000-4000-8000-000000000001', name: 'Alguien', role },
  status: 'ready',
});

function renderGuard() {
  return render(
    <RequireRole role="ADMIN" deniedMessage="No tenés permiso para cargar documentos.">
      <Formulario />
    </RequireRole>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('RequireRole (F1)', () => {
  test('con ADMIN renderiza el contenido', () => {
    mocks.useSession.mockReturnValue(sessionOf('ADMIN'));
    renderGuard();

    expect(screen.getByText('Formulario de carga')).toBeInTheDocument();
    expect(mocks.mounted).toHaveBeenCalledTimes(1);
  });

  test.each(['SUPERVISOR', 'EMPLOYEE'] as const)(
    'con %s muestra el mensaje y el contenido no se monta',
    (role) => {
      mocks.useSession.mockReturnValue(sessionOf(role));
      renderGuard();

      expect(screen.getByText('No tenés permiso para cargar documentos.')).toBeInTheDocument();
      expect(screen.queryByText('Formulario de carga')).not.toBeInTheDocument();
      expect(mocks.mounted).not.toHaveBeenCalled();
    },
  );

  test('sin permiso ofrece volver a Documentos', () => {
    mocks.useSession.mockReturnValue(sessionOf('EMPLOYEE'));
    renderGuard();

    expect(screen.getByRole('link', { name: 'Volver a Documentos' })).toHaveAttribute(
      'href',
      '/documentos',
    );
  });

  test('sin sesión muestra "Elegí un usuario de prueba" y no monta el contenido', () => {
    mocks.useSession.mockReturnValue({ user: null, status: 'ready' });
    renderGuard();

    expect(screen.getByText('Elegí un usuario de prueba')).toBeInTheDocument();
    expect(mocks.mounted).not.toHaveBeenCalled();
  });

  test('mientras se lee la sesión, cargando y sin montar el contenido', () => {
    mocks.useSession.mockReturnValue({ user: null, status: 'loading' });
    renderGuard();

    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true');
    expect(mocks.mounted).not.toHaveBeenCalled();
  });

  test('con la sesión desactivada (producción), "Tu sesión no es válida" y sin contenido', () => {
    mocks.useSession.mockReturnValue({ user: null, status: 'disabled' });
    renderGuard();

    expect(screen.getByText('Tu sesión no es válida. Volvé a ingresar.')).toBeInTheDocument();
    expect(mocks.mounted).not.toHaveBeenCalled();
  });
});
