import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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

// Spec 006, W10 (E49): the card of the procedures, for every role, with the style of the others.
describe('HomeView — tarjeta Procedimientos (spec 006, HU11)', () => {
  test.each([
    ['EMPLOYEE', 'Elena Empleada de Ventas', 'Ver procedimientos →'],
    ['SUPERVISOR', 'Sergio Supervisor de Ventas', 'Ver procedimientos →'],
    ['ADMIN', 'Ana Administradora', 'Gestionar procedimientos →'],
  ] as const)('un %s ve la tarjeta que lleva a /procedimientos', (role, name, cta) => {
    mocks.useSession.mockReturnValue(sessionFor(role, name));
    render(<HomeView />);

    const card = screen.getByRole('heading', { level: 3, name: 'Procedimientos' }).closest('article');
    expect(card).not.toBeNull();
    expect(within(card as HTMLElement).getByRole('link', { name: cta })).toHaveAttribute(
      'href',
      '/procedimientos',
    );
  });

  test('sin sesión no hay tarjeta ni enlace a /procedimientos', () => {
    mocks.useSession.mockReturnValue({ user: null, status: 'ready' });
    render(<HomeView />);

    expect(screen.queryByRole('heading', { name: 'Procedimientos' })).not.toBeInTheDocument();
    expect(allLinkHrefs()).not.toContain('/procedimientos');
  });
});

// The card of the personal activity of the employee (HU38), next to "Ejecuciones y recorridos".
describe('HomeView — tarjeta Mi actividad', () => {
  test('un EMPLOYEE ve la tarjeta, después de Ejecuciones, que lleva a /ejecuciones/mi-actividad', () => {
    mocks.useSession.mockReturnValue(sessionFor('EMPLOYEE', 'Elena Empleada de Ventas'));
    render(<HomeView />);

    const card = screen.getByRole('heading', { level: 3, name: 'Mi actividad' }).closest('article');
    expect(card).not.toBeNull();
    expect(within(card as HTMLElement).getByText('Tus recorridos')).toBeInTheDocument();
    expect(
      within(card as HTMLElement).getByText(
        'Mirá cuánto tardás, tus recorridos completados y cuáles retomar.',
      ),
    ).toBeInTheDocument();
    expect(
      within(card as HTMLElement).getByRole('link', { name: 'Ver mi actividad →' }),
    ).toHaveAttribute('href', '/ejecuciones/mi-actividad');

    const titles = screen
      .getAllByRole('heading', { level: 3 })
      .map((heading) => heading.textContent);
    expect(titles.slice(-2)).toEqual(['Ejecuciones y recorridos', 'Mi actividad']);
  });

  test.each([
    ['ADMIN', 'Ana Administradora'],
    ['SUPERVISOR', 'Sergio Supervisor de Ventas'],
  ] as const)('un %s no la ve', (role, name) => {
    mocks.useSession.mockReturnValue(sessionFor(role, name));
    render(<HomeView />);

    expect(screen.queryByRole('heading', { name: 'Mi actividad' })).not.toBeInTheDocument();
    expect(allLinkHrefs()).not.toContain('/ejecuciones/mi-actividad');
  });
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
      expect(screen.queryByTestId('ambient-feathers')).not.toBeInTheDocument();
    });
  });

  describe('sin sesión autenticada', () => {
    test('en modo real muestra la landing institucional, acceso a /login, plumas ambientales y ningún acceso privado', () => {
      mocks.realAuthEnabled = true;
      mocks.useSession.mockReturnValue({ user: null, status: 'ready' });
      render(<HomeView />);

      expect(
        screen.getByRole('heading', {
          level: 1,
          name: /El nido donde vive el conocimiento de tu organización/i,
        }),
      ).toBeInTheDocument();

      expect(screen.getByRole('heading', { level: 2, name: '¿Qué es PispIAr?' })).toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 2, name: 'Nuestro objetivo' })).toBeInTheDocument();
      expect(
        screen.getByRole('heading', { level: 2, name: 'Tres pilares de la plataforma' }),
      ).toBeInTheDocument();
      expect(screen.getByText('Documentación organizada y vigente')).toBeInTheDocument();
      expect(screen.getByText('Procedimientos y recorridos paso a paso')).toBeInTheDocument();
      expect(screen.getByText('Asistente inteligente con citas respaldadas')).toBeInTheDocument();
      expect(
        screen.getByRole('img', { name: 'Hornero de pispIAr sobre su nido de barro' }),
      ).toBeInTheDocument();

      const feathers = screen.getByTestId('ambient-feathers');
      expect(feathers).toHaveAttribute('aria-hidden', 'true');

      expect(screen.getByRole('link', { name: 'Ingresar →' })).toHaveAttribute('href', '/login');
      expect(screen.getByRole('link', { name: 'Ingresar a la plataforma →' })).toHaveAttribute(
        'href',
        '/login',
      );
      expect(allLinkHrefs()).toEqual(['/login', '/login']);
      expect(screen.queryByText('Tus herramientas disponibles')).not.toBeInTheDocument();
      expect(screen.queryByText('Tu rol actual')).not.toBeInTheDocument();
    });

    test('en modo simulado muestra la landing institucional, aviso del selector de prueba y ningún acceso privado', () => {
      mocks.realAuthEnabled = false;
      mocks.useSession.mockReturnValue({ user: null, status: 'ready' });
      render(<HomeView />);

      expect(
        screen.getByRole('heading', {
          level: 1,
          name: /El nido donde vive el conocimiento de tu organización/i,
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
      expect(allLinkHrefs()).toEqual(['/login', '/login']);
    });

    test('la animación ambiental respeta prefers-reduced-motion en CSS', () => {
      const css = readFileSync(
        resolve(process.cwd(), 'components/home/AmbientFeathers.module.css'),
        'utf8',
      );
      expect(css).toContain('@media (prefers-reduced-motion: no-preference)');
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

      expect(allLinkHrefs()).toEqual([
        '/documentos',
        '/procedimientos',
        '/ejecuciones',
        '/ejecuciones/mi-actividad',
      ]);
      expect(screen.queryByText('Métricas')).not.toBeInTheDocument();
      expect(screen.queryByText('Acciones rápidas de administración')).not.toBeInTheDocument();
      expect(screen.queryByTestId('ambient-feathers')).not.toBeInTheDocument();
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

      expect(allLinkHrefs()).toEqual(['/documentos', '/procedimientos', '/metricas']);
      expect(screen.queryByText('Ejecuciones y recorridos')).not.toBeInTheDocument();
      expect(screen.queryByText('Acciones rápidas de administración')).not.toBeInTheDocument();
      expect(screen.queryByTestId('ambient-feathers')).not.toBeInTheDocument();
    });
  });

  describe('con sesión ADMIN', () => {
    beforeEach(() => {
      mocks.useSession.mockReturnValue(sessionFor('ADMIN', 'Ana Administradora'));
    });

    test('saluda por nombre, muestra el rol Administrador, Documentos, Métricas, Cargar documento, Por revisar y Alertas', () => {
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
      expect(screen.getByRole('link', { name: 'Alertas →' })).toHaveAttribute(
        'href',
        '/documentos/alertas',
      );

      expect(allLinkHrefs()).toEqual([
        '/documentos',
        '/procedimientos',
        '/metricas',
        '/documentos/nuevo',
        '/documentos/por-revisar',
        '/documentos/alertas',
      ]);
      expect(screen.queryByText('Ejecuciones y recorridos')).not.toBeInTheDocument();
      expect(screen.queryByTestId('ambient-feathers')).not.toBeInTheDocument();
    });
  });
});
