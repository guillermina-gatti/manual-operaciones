import { render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { RequireRole } from '@/components/session/RequireRole';
import type { Role, SessionState } from '@/lib/session';

const mocks = vi.hoisted(() => ({
  useSession: vi.fn(),
  mounted: vi.fn(),
  realAuthEnabled: true,
  pathname: '/documentos/nuevo',
  searchParams: new URLSearchParams(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => mocks.pathname,
  useSearchParams: () => mocks.searchParams,
}));

vi.mock('@/lib/session', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/session')>();
  return {
    ...actual,
    useSession: mocks.useSession,
    get REAL_AUTH_ENABLED() {
      return mocks.realAuthEnabled;
    },
  };
});

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
  mocks.realAuthEnabled = true;
  mocks.pathname = '/documentos/nuevo';
  mocks.searchParams = new URLSearchParams();
});

describe('RequireRole (F1)', () => {
  describe('compatibilidad con prop role única', () => {
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

    test('con role="EMPLOYEE" renderiza el contenido para EMPLOYEE', () => {
      mocks.useSession.mockReturnValue(sessionOf('EMPLOYEE'));
      render(
        <RequireRole role="EMPLOYEE" deniedMessage="Solo los empleados pueden ejecutar procedimientos.">
          <Formulario />
        </RequireRole>,
      );

      expect(screen.getByText('Formulario de carga')).toBeInTheDocument();
      expect(mocks.mounted).toHaveBeenCalledTimes(1);
    });

    test.each(['ADMIN', 'SUPERVISOR'] as const)(
      'con role="EMPLOYEE" deniega el acceso a %s y no monta el contenido',
      (role) => {
        mocks.useSession.mockReturnValue(sessionOf(role));
        render(
          <RequireRole role="EMPLOYEE" deniedMessage="Solo los empleados pueden ejecutar procedimientos.">
            <Formulario />
          </RequireRole>,
        );

        expect(
          screen.getByText('Solo los empleados pueden ejecutar procedimientos.'),
        ).toBeInTheDocument();
        expect(screen.queryByText('Formulario de carga')).not.toBeInTheDocument();
        expect(mocks.mounted).not.toHaveBeenCalled();
      },
    );
  });

  describe('soporte de múltiples roles (prop roles)', () => {
    function renderMultiGuard() {
      return render(
        <RequireRole
          roles={['ADMIN', 'SUPERVISOR']}
          deniedMessage="Solo administradores y supervisores pueden ver este panel."
        >
          <Formulario />
        </RequireRole>,
      );
    }

    test.each(['ADMIN', 'SUPERVISOR'] as const)(
      'permite el acceso si el rol %s está incluido en la lista',
      (role) => {
        mocks.useSession.mockReturnValue(sessionOf(role));
        renderMultiGuard();

        expect(screen.getByText('Formulario de carga')).toBeInTheDocument();
        expect(mocks.mounted).toHaveBeenCalledTimes(1);
      },
    );

    test('deniega el acceso y no monta el contenido si el rol no está en la lista', () => {
      mocks.useSession.mockReturnValue(sessionOf('EMPLOYEE'));
      renderMultiGuard();

      expect(
        screen.getByText('Solo administradores y supervisores pueden ver este panel.'),
      ).toBeInTheDocument();
      expect(screen.queryByText('Formulario de carga')).not.toBeInTheDocument();
      expect(mocks.mounted).not.toHaveBeenCalled();
    });
  });

  describe('comportamiento ante propiedades inválidas o contradictorias (fail-closed)', () => {
    test('si se pasan role y roles simultáneamente, deniega el acceso por seguridad y no monta contenido', () => {
      mocks.useSession.mockReturnValue(sessionOf('ADMIN'));
      render(
        <RequireRole
          role="ADMIN"
          roles={['ADMIN', 'SUPERVISOR']}
          deniedMessage="Configuración no válida."
        >
          <Formulario />
        </RequireRole>,
      );

      expect(screen.getByText('Configuración no válida.')).toBeInTheDocument();
      expect(mocks.mounted).not.toHaveBeenCalled();
    });

    test('si no se pasa ni role ni roles, deniega el acceso por seguridad y no monta contenido', () => {
      mocks.useSession.mockReturnValue(sessionOf('ADMIN'));
      render(
        <RequireRole deniedMessage="Sin rol configurado.">
          <Formulario />
        </RequireRole>,
      );

      expect(screen.getByText('Sin rol configurado.')).toBeInTheDocument();
      expect(mocks.mounted).not.toHaveBeenCalled();
    });

    test('si roles es un array vacío, deniega el acceso por seguridad y no monta contenido', () => {
      mocks.useSession.mockReturnValue(sessionOf('ADMIN'));
      render(
        <RequireRole roles={[]} deniedMessage="Lista de roles vacía.">
          <Formulario />
        </RequireRole>,
      );

      expect(screen.getByText('Lista de roles vacía.')).toBeInTheDocument();
      expect(mocks.mounted).not.toHaveBeenCalled();
    });
  });

  describe('preservación de returnTo al requerir sesión', () => {
    test('incluye returnTo con la ruta actual en el enlace de login', () => {
      mocks.useSession.mockReturnValue({ user: null, status: 'ready' });
      mocks.pathname = '/documentos/nuevo';
      renderGuard();

      expect(
        screen.getByText('Necesitás iniciar sesión para acceder a esta sección.'),
      ).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Ir a iniciar sesión' })).toHaveAttribute(
        'href',
        '/login?returnTo=%2Fdocumentos%2Fnuevo',
      );
      expect(mocks.mounted).not.toHaveBeenCalled();
    });

    test('incluye searchParams de la ruta de origen en returnTo', () => {
      mocks.useSession.mockReturnValue({ user: null, status: 'ready' });
      mocks.pathname = '/ejecuciones';
      mocks.searchParams = new URLSearchParams('paso=2&area=ventas');
      renderGuard();

      expect(screen.getByRole('link', { name: 'Ir a iniciar sesión' })).toHaveAttribute(
        'href',
        '/login?returnTo=%2Fejecuciones%3Fpaso%3D2%26area%3Dventas',
      );
      expect(mocks.mounted).not.toHaveBeenCalled();
    });

    test('no agrega returnTo redundante si la ruta actual es /', () => {
      mocks.useSession.mockReturnValue({ user: null, status: 'ready' });
      mocks.pathname = '/';
      renderGuard();

      expect(screen.getByRole('link', { name: 'Ir a iniciar sesión' })).toHaveAttribute(
        'href',
        '/login',
      );
      expect(mocks.mounted).not.toHaveBeenCalled();
    });
  });

  describe('otros estados de sesión', () => {
    test('sin sesión con autenticación simulada muestra "Elegí un usuario de prueba" y no monta el contenido', () => {
      mocks.realAuthEnabled = false;
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
});
