import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { Sidebar } from '@/components/navigation/Sidebar';
import { MY_ACTIVITY_PATH } from '@/lib/executions/my-activity';
import type { SessionUser } from '@/lib/session';

const mocks = vi.hoisted(() => ({
  pathname: '/',
}));

vi.mock('next/navigation', () => ({
  usePathname: () => mocks.pathname,
}));

describe('Sidebar (diseño v2)', () => {
  const onLogout = vi.fn();
  const onNavigate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.pathname = '/';
  });

  describe('visibilidad de navegación por rol', () => {
    test('un EMPLOYEE ve Inicio, Documentos, Ejecuciones y Asistente (no ve Procedimientos, Métricas, Usuarios ni Invitaciones)', () => {
      const employee: SessionUser = { id: 'emp-1', name: 'Elena Díaz', role: 'EMPLOYEE' };
      render(<Sidebar user={employee} onLogout={onLogout} onNavigate={onNavigate} />);

      expect(screen.getByRole('link', { name: 'Inicio' })).toHaveAttribute('href', '/');
      expect(screen.getByRole('link', { name: 'Documentos' })).toHaveAttribute('href', '/documentos');
      expect(screen.getByRole('link', { name: 'Ejecuciones' })).toHaveAttribute('href', '/ejecuciones');
      expect(screen.getByRole('link', { name: 'Asistente' })).toHaveAttribute('href', '/asistente');

      expect(screen.queryByRole('link', { name: 'Procedimientos' })).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Métricas' })).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Usuarios y roles' })).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Invitar usuario' })).not.toBeInTheDocument();
    });

    test('un SUPERVISOR ve Procedimientos, Métricas y Usuarios y roles a cargo, pero no Invitaciones', () => {
      const supervisor: SessionUser = { id: 'sup-1', name: 'Sergio Ruiz', role: 'SUPERVISOR' };
      render(<Sidebar user={supervisor} onLogout={onLogout} onNavigate={onNavigate} />);

      expect(screen.getByRole('link', { name: 'Inicio' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Documentos' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Procedimientos' })).toHaveAttribute('href', '/procedimientos');
      expect(screen.getByRole('link', { name: 'Ejecuciones' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Métricas' })).toHaveAttribute('href', '/metricas');
      expect(screen.getByRole('link', { name: 'Usuarios y roles' })).toHaveAttribute('href', '/usuarios');
      expect(screen.getByRole('link', { name: 'Asistente' })).toBeInTheDocument();

      expect(screen.queryByRole('link', { name: 'Invitar usuario' })).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Áreas' })).not.toBeInTheDocument();
    });

    test('un ADMIN ve todos los módulos incluyendo Usuarios y roles e Invitaciones', () => {
      const admin: SessionUser = { id: 'adm-1', name: 'Ana López', role: 'ADMIN' };
      render(<Sidebar user={admin} onLogout={onLogout} onNavigate={onNavigate} />);

      expect(screen.getByRole('link', { name: 'Inicio' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Documentos' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Procedimientos' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Ejecuciones' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Métricas' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Usuarios y roles' })).toHaveAttribute('href', '/usuarios');
      expect(screen.getByRole('link', { name: 'Invitar usuario' })).toHaveAttribute(
        'href',
        '/admin/invitaciones',
      );
      expect(screen.getByRole('link', { name: 'Áreas' })).toHaveAttribute('href', '/admin/areas');
      expect(screen.getByRole('link', { name: 'Asistente' })).toBeInTheDocument();
    });
  });

  describe('estado activo', () => {
    test('marca Inicio como aria-current="page" cuando la ruta es "/"', () => {
      mocks.pathname = '/';
      const user: SessionUser = { id: 'adm-1', name: 'Ana López', role: 'ADMIN' };
      render(<Sidebar user={user} onLogout={onLogout} onNavigate={onNavigate} />);

      const homeLink = screen.getByRole('link', { name: 'Inicio' });
      expect(homeLink).toHaveAttribute('aria-current', 'page');
    });

    test('marca Procedimientos como activo cuando la ruta es "/procedimientos"', () => {
      mocks.pathname = '/procedimientos';
      const user: SessionUser = { id: 'adm-1', name: 'Ana López', role: 'ADMIN' };
      render(<Sidebar user={user} onLogout={onLogout} onNavigate={onNavigate} />);

      const proceduresLink = screen.getByRole('link', { name: 'Procedimientos' });
      expect(proceduresLink).toHaveAttribute('aria-current', 'page');

      const homeLink = screen.getByRole('link', { name: 'Inicio' });
      expect(homeLink).not.toHaveAttribute('aria-current');
    });

    test('marca Documentos como activo cuando la ruta es un subdirectorio como "/documentos/123"', () => {
      mocks.pathname = '/documentos/123';
      const user: SessionUser = { id: 'adm-1', name: 'Ana López', role: 'ADMIN' };
      render(<Sidebar user={user} onLogout={onLogout} onNavigate={onNavigate} />);

      const docsLink = screen.getByRole('link', { name: 'Documentos' });
      expect(docsLink).toHaveAttribute('aria-current', 'page');
    });
  });

  describe('Mi actividad', () => {
    const employee: SessionUser = { id: 'emp-1', name: 'Elena Díaz', role: 'EMPLOYEE' };

    test('un EMPLOYEE lo ve justo después de Ejecuciones, y lleva a su pantalla', () => {
      render(<Sidebar user={employee} onLogout={onLogout} onNavigate={onNavigate} />);

      const link = screen.getByRole('link', { name: 'Mi actividad' });
      expect(link).toHaveAttribute('href', MY_ACTIVITY_PATH);
      const names = within(screen.getByRole('navigation', { name: 'Menú principal' }))
        .getAllByRole('link')
        .map((item) => item.textContent);
      expect(names[names.indexOf('Ejecuciones') + 1]).toBe('Mi actividad');
    });

    test.each([
      ['SUPERVISOR', { id: 'sup-1', name: 'Sergio Ruiz', role: 'SUPERVISOR' }],
      ['ADMIN', { id: 'adm-1', name: 'Ana López', role: 'ADMIN' }],
    ] as const)('un %s no lo ve', (_role, user) => {
      render(<Sidebar user={user} onLogout={onLogout} onNavigate={onNavigate} />);

      expect(screen.queryByRole('link', { name: 'Mi actividad' })).not.toBeInTheDocument();
    });

    test('en Mi actividad solo se marca Mi actividad, no Ejecuciones', () => {
      mocks.pathname = MY_ACTIVITY_PATH;
      render(<Sidebar user={employee} onLogout={onLogout} onNavigate={onNavigate} />);

      expect(screen.getByRole('link', { name: 'Mi actividad' })).toHaveAttribute('aria-current', 'page');
      expect(screen.getByRole('link', { name: 'Ejecuciones' })).not.toHaveAttribute('aria-current');
    });

    test('en una ejecución se marca Ejecuciones, no Mi actividad', () => {
      mocks.pathname = '/ejecuciones/2c000000-0000-4000-8000-000000000001';
      render(<Sidebar user={employee} onLogout={onLogout} onNavigate={onNavigate} />);

      expect(screen.getByRole('link', { name: 'Ejecuciones' })).toHaveAttribute('aria-current', 'page');
      expect(screen.getByRole('link', { name: 'Mi actividad' })).not.toHaveAttribute('aria-current');
    });
  });

  describe('tarjeta del hornero y perfil de usuario', () => {
    test('la tarjeta de ayuda lleva a /asistente con el texto "¿Dudas? Preguntale al hornero"', () => {
      const user: SessionUser = { id: 'emp-1', name: 'Elena Díaz', role: 'EMPLOYEE' };
      render(<Sidebar user={user} onLogout={onLogout} onNavigate={onNavigate} />);

      const card = screen.getByRole('link', { name: 'Preguntale al asistente' });
      expect(card).toHaveAttribute('href', '/asistente');
      expect(card).toHaveTextContent('¿Dudas?');
      expect(card).toHaveTextContent('Preguntale al hornero');
    });

    test('muestra las iniciales en el avatar y la descripción del usuario', () => {
      const user: SessionUser = { id: 'emp-1', name: 'Elena Díaz', role: 'EMPLOYEE' };
      render(<Sidebar user={user} onLogout={onLogout} onNavigate={onNavigate} />);

      expect(screen.getByText('ED')).toBeInTheDocument();
      expect(screen.getByText('Elena Díaz')).toBeInTheDocument();
      expect(screen.getByText('Empleada · Ventas')).toBeInTheDocument();
    });

    test('el botón de cerrar sesión invoca onLogout', async () => {
      const userEventSetup = userEvent.setup();
      const user: SessionUser = { id: 'emp-1', name: 'Elena Díaz', role: 'EMPLOYEE' };
      render(<Sidebar user={user} onLogout={onLogout} onNavigate={onNavigate} />);

      const logoutBtn = screen.getByRole('button', { name: 'Cerrar sesión' });
      await userEventSetup.click(logoutBtn);
      expect(onLogout).toHaveBeenCalledTimes(1);
    });

    test('al hacer clic en un enlace de navegación se dispara onNavigate', async () => {
      const userEventSetup = userEvent.setup();
      const user: SessionUser = { id: 'emp-1', name: 'Elena Díaz', role: 'EMPLOYEE' };
      render(<Sidebar user={user} onLogout={onLogout} onNavigate={onNavigate} />);

      const docsLink = screen.getByRole('link', { name: 'Documentos' });
      await userEventSetup.click(docsLink);
      expect(onNavigate).toHaveBeenCalledTimes(1);
    });
  });
});
