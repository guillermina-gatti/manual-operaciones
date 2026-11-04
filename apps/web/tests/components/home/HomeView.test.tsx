import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { HomeView } from '@/components/home/HomeView';
import type { Role, SessionState } from '@/lib/session';

const mocks = vi.hoisted(() => ({
  useSession: vi.fn<() => SessionState>(),
  realAuthEnabled: true,
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

const sessionFor = (role: Role, name: string): SessionState => ({
  user: {
    id: '0b000000-0000-4000-8000-000000000001',
    name,
    role,
  },
  status: 'ready',
});

const allLinkHrefs = () =>
  screen.queryAllByRole('link').map((link) => link.getAttribute('href'));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.realAuthEnabled = true;
});

describe('HomeView — A-10b.3 Home de PispIAr', () => {
  describe('estado de carga', () => {
    test('mientras se verifica la sesión muestra estado accesible y ningún módulo privado', () => {
      mocks.useSession.mockReturnValue({ user: null, status: 'loading' });
      render(<HomeView />);

      const status = screen.getByRole('status');
      expect(status).toHaveAttribute('aria-busy', 'true');
      expect(screen.getByText('Preparando tu inicio…')).toBeInTheDocument();
      expect(screen.queryByRole('link')).not.toBeInTheDocument();
    });
  });

  describe('sin sesión autenticada', () => {
    test('en modo real muestra el Hero público, CTA "Ingresar →" hacia /login y ningún acceso privado', () => {
      mocks.realAuthEnabled = true;
      mocks.useSession.mockReturnValue({ user: null, status: 'ready' });
      render(<HomeView />);

      expect(
        screen.getByRole('heading', {
          level: 1,
          name: /Tu nido de conocimiento operativo.*Consultá documentos y recorridos paso a paso en pispIAr/i,
        }),
      ).toBeInTheDocument();

      const loginLink = screen.getByRole('link', { name: 'Ingresar →' });
      expect(loginLink).toHaveAttribute('href', '/login');
      expect(allLinkHrefs()).toEqual(['/login']);
      expect(screen.queryByText('Tus herramientas disponibles')).not.toBeInTheDocument();
      expect(screen.queryByText('Tu rol actual')).not.toBeInTheDocument();
      expect(screen.getByText('Tip del hornero')).toBeInTheDocument();
    });

    test('en modo simulado muestra el Hero público, aviso del selector de prueba y ningún acceso privado', () => {
      mocks.realAuthEnabled = false;
      mocks.useSession.mockReturnValue({ user: null, status: 'ready' });
      render(<HomeView />);

      expect(
        screen.getByRole('heading', {
          level: 1,
          name: /Tu nido de conocimiento operativo.*Consultá documentos y recorridos paso a paso en pispIAr/i,
        }),
      ).toBeInTheDocument();

      expect(screen.getByText(/Elegí un usuario de prueba en el selector disponible/i)).toBeInTheDocument();
      expect(screen.queryByRole('link')).not.toBeInTheDocument();
      expect(screen.queryByText('Tus herramientas disponibles')).not.toBeInTheDocument();
    });

    test('con sesión deshabilitada (disabled) no expone módulos privados', () => {
      mocks.useSession.mockReturnValue({ user: null, status: 'disabled' });
      render(<HomeView />);

      expect(screen.queryByText('Tus herramientas disponibles')).not.toBeInTheDocument();
      expect(allLinkHrefs()).toEqual(['/login']);
    });
  });

  describe('con sesión EMPLOYEE', () => {
    beforeEach(() => {
      mocks.useSession.mockReturnValue(sessionFor('EMPLOYEE', 'Elena Empleada de Ventas'));
    });

    test('saluda por nombre, muestra el rol Empleado y habilita solo Documentos y Ejecuciones', () => {
      render(<HomeView />);

      expect(
        screen.getByRole('heading', {
          level: 1,
          name: /¡Buen día, Elena Empleada de Ventas!.*¿Qué procedimiento o documento necesitás hoy\?/i,
        }),
      ).toBeInTheDocument();

      const aside = screen.getByRole('complementary', { name: 'Contexto y ayuda' });
      expect(within(aside).getByRole('heading', { name: 'Empleado' })).toBeInTheDocument();
      expect(within(aside).getByRole('heading', { name: 'Tip del hornero' })).toBeInTheDocument();

      expect(screen.getByRole('link', { name: 'Ver documentos →' })).toHaveAttribute(
        'href',
        '/documentos',
      );
      expect(screen.getByRole('link', { name: 'Ir a ejecuciones →' })).toHaveAttribute(
        'href',
        '/ejecuciones',
      );

      expect(allLinkHrefs()).toEqual(['/documentos', '/ejecuciones']);
      expect(screen.queryByText('Métricas')).not.toBeInTheDocument();
      expect(screen.queryByText('Acciones rápidas de administración')).not.toBeInTheDocument();
    });
  });

  describe('con sesión SUPERVISOR', () => {
    beforeEach(() => {
      mocks.useSession.mockReturnValue(sessionFor('SUPERVISOR', 'Sergio Supervisor de Ventas'));
    });

    test('saluda por nombre, muestra el rol Supervisor y habilita solo Documentos y Métricas', () => {
      render(<HomeView />);

      expect(
        screen.getByRole('heading', {
          level: 1,
          name: /¡Buen día, Sergio Supervisor de Ventas!.*¿Qué procedimiento o documento necesitás hoy\?/i,
        }),
      ).toBeInTheDocument();

      const aside = screen.getByRole('complementary', { name: 'Contexto y ayuda' });
      expect(within(aside).getByRole('heading', { name: 'Supervisor' })).toBeInTheDocument();

      expect(screen.getByRole('link', { name: 'Ver documentos →' })).toHaveAttribute(
        'href',
        '/documentos',
      );
      expect(screen.getByRole('link', { name: 'Ver métricas →' })).toHaveAttribute(
        'href',
        '/metricas',
      );

      expect(allLinkHrefs()).toEqual(['/documentos', '/metricas']);
      expect(screen.queryByText('Ejecuciones y recorridos')).not.toBeInTheDocument();
      expect(screen.queryByText('Acciones rápidas de administración')).not.toBeInTheDocument();
    });
  });

  describe('con sesión ADMIN', () => {
    beforeEach(() => {
      mocks.useSession.mockReturnValue(sessionFor('ADMIN', 'Ana Administradora'));
    });

    test('saluda por nombre, muestra el rol Administrador, Documentos, Métricas, Cargar documento y Por revisar', () => {
      render(<HomeView />);

      expect(
        screen.getByRole('heading', {
          level: 1,
          name: /¡Buen día, Ana Administradora!.*¿Qué procedimiento o documento necesitás hoy\?/i,
        }),
      ).toBeInTheDocument();

      const aside = screen.getByRole('complementary', { name: 'Contexto y ayuda' });
      expect(within(aside).getByRole('heading', { name: 'Administrador' })).toBeInTheDocument();

      expect(screen.getByRole('link', { name: 'Ver documentos →' })).toHaveAttribute(
        'href',
        '/documentos',
      );
      expect(screen.getByRole('link', { name: 'Ver métricas →' })).toHaveAttribute(
        'href',
        '/metricas',
      );
      expect(screen.getByRole('link', { name: '+ Cargar documento →' })).toHaveAttribute(
        'href',
        '/documentos/nuevo',
      );
      expect(screen.getByRole('link', { name: 'Por revisar →' })).toHaveAttribute(
        'href',
        '/documentos/por-revisar',
      );

      expect(allLinkHrefs()).toEqual([
        '/documentos',
        '/metricas',
        '/documentos/nuevo',
        '/documentos/por-revisar',
      ]);
      expect(screen.queryByText('Ejecuciones y recorridos')).not.toBeInTheDocument();
    });
  });
});
