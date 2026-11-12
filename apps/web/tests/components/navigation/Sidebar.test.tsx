import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { Sidebar } from '@/components/navigation/Sidebar';
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
    test('un EMPLOYEE ve Inicio, Documentos, Ejecuciones y Asistente (no ve Procedimientos, Métricas ni Usuarios)', () => {
      const employee: SessionUser = { id: 'emp-1', name: 'Elena Díaz', role: 'EMPLOYEE' };
      render(<Sidebar user={employee} onLogout={onLogout} onNavigate={onNavigate} />);

      expect(screen.getByRole('link', { name: 'Inicio' })).toHaveAttribute('href', '/');
      expect(screen.getByRole('link', { name: 'Documentos' })).toHaveAttribute('href', '/documentos');
      expect(screen.getByRole('link', { name: 'Ejecuciones' })).toHaveAttribute('href', '/ejecuciones');
      expect(screen.getByRole('link', { name: 'Asistente' })).toHaveAttribute('href', '/asistente');

      expect(screen.queryByRole('link', { name: 'Procedimientos' })).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Métricas' })).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Usuarios y roles' })).not.toBeInTheDocument();
    });

    test('un SUPERVISOR ve Procedimientos y Métricas pero no Usuarios y roles', () => {
      const supervisor: SessionUser = { id: 'sup-1', name: 'Sergio Ruiz', role: 'SUPERVISOR' };
      render(<Sidebar user={supervisor} onLogout={onLogout} onNavigate={onNavigate} />);

      expect(screen.getByRole('link', { name: 'Inicio' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Documentos' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Procedimientos' })).toHaveAttribute('href', '/procedimientos');
      expect(screen.getByRole('link', { name: 'Ejecuciones' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Métricas' })).toHaveAttribute('href', '/metricas');
      expect(screen.getByRole('link', { name: 'Asistente' })).toBeInTheDocument();

      expect(screen.queryByRole('link', { name: 'Usuarios y roles' })).not.toBeInTheDocument();
    });

    test('un ADMIN ve todos los módulos incluyendo Usuarios y roles', () => {
      const admin: SessionUser = { id: 'adm-1', name: 'Ana López', role: 'ADMIN' };
      render(<Sidebar user={admin} onLogout={onLogout} onNavigate={onNavigate} />);

      expect(screen.getByRole('link', { name: 'Inicio' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Documentos' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Procedimientos' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Ejecuciones' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Métricas' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /Invitar usuario|Usuarios y roles/ })).toHaveAttribute(
        'href',
        '/admin/invitaciones',
      );
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
