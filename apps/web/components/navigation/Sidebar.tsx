'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useId } from 'react';
import { FIXTURE_USERS } from '@/lib/directory/fixtures';
import type { Role, SessionUser } from '@/lib/session';

interface SidebarProps {
  user: SessionUser;
  onLogout: () => void | Promise<void>;
  pendingLogout?: boolean;
  onNavigate?: () => void;
}

interface NavItemConfig {
  id: string;
  label: string;
  href: string;
  roles?: readonly Role[];
  icon: (props: { className?: string }) => React.ReactNode;
}

function HomeIcon({ className = 'size-5' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 9.5L12 3l9 6.5V20a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9.5z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

function DocumentsIcon({ className = 'size-5' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  );
}

function ProceduresIcon({ className = 'size-5' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="6" cy="6" r="2.5" />
      <circle cx="18" cy="18" r="2.5" />
      <path d="M8.5 6h4a4 4 0 0 1 4 4v4a4 4 0 0 0 4 4h-2" />
    </svg>
  );
}

function ExecutionsIcon({ className = 'size-5' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <polygon points="10 8 16 12 10 16 10 8" />
    </svg>
  );
}

function MetricsIcon({ className = 'size-5' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="6" y1="20" x2="6" y2="14" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="3" y1="20" x2="21" y2="20" />
    </svg>
  );
}

function UsersIcon({ className = 'size-5' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function InviteIcon({ className = 'size-5' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="8.5" cy="7" r="4" />
      <line x1="20" y1="8" x2="20" y2="14" />
      <line x1="23" y1="11" x2="17" y2="11" />
    </svg>
  );
}

function AssistantIcon({ className = 'size-5' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  );
}

function LogoutIcon({ className = 'size-5' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

function BuildingIcon({ className = 'size-5' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect width="16" height="20" x="4" y="2" rx="2" ry="2" />
      <path d="M9 22v-4h6v4" />
      <path d="M8 6h.01" />
      <path d="M16 6h.01" />
      <path d="M8 10h.01" />
      <path d="M16 10h.01" />
      <path d="M8 14h.01" />
      <path d="M16 14h.01" />
    </svg>
  );
}

const NAV_ITEMS: readonly NavItemConfig[] = [
  {
    id: 'inicio',
    label: 'Inicio',
    href: '/',
    icon: HomeIcon,
  },
  {
    id: 'documentos',
    label: 'Documentos',
    href: '/documentos',
    icon: DocumentsIcon,
  },
  {
    id: 'procedimientos',
    label: 'Procedimientos',
    href: '/procedimientos',
    roles: ['ADMIN', 'SUPERVISOR'],
    icon: ProceduresIcon,
  },
  {
    id: 'ejecuciones',
    label: 'Ejecuciones',
    href: '/ejecuciones',
    icon: ExecutionsIcon,
  },
  {
    id: 'metricas',
    label: 'Métricas',
    href: '/metricas',
    roles: ['ADMIN', 'SUPERVISOR'],
    icon: MetricsIcon,
  },
  {
    id: 'usuarios',
    label: 'Usuarios y roles',
    href: '/usuarios',
    roles: ['ADMIN', 'SUPERVISOR'],
    icon: UsersIcon,
  },
  {
    id: 'invitaciones',
    label: 'Invitaciones',
    href: '/admin/invitaciones',
    roles: ['ADMIN'],
    icon: InviteIcon,
  },
  {
    id: 'areas',
    label: 'Áreas',
    href: '/admin/areas',
    roles: ['ADMIN'],
    icon: BuildingIcon,
  },
  {
    id: 'asistente',
    label: 'Asistente',
    href: '/asistente',
    icon: AssistantIcon,
  },
];

export function getInitials(name: string): string {
  if (!name) return '?';
  const clean = name.trim().split(/\s+/);
  if (clean.length >= 2) {
    return `${clean[0][0]}${clean[1][0]}`.toUpperCase();
  }
  return clean[0].slice(0, 2).toUpperCase();
}

export function formatUserRole(user: SessionUser): string {
  if (user.id === FIXTURE_USERS.empleadoVentas.id || user.name.toLowerCase().includes('elena')) {
    return 'Empleada · Ventas';
  }
  if (user.id === FIXTURE_USERS.admin.id || user.name.toLowerCase().includes('ana')) {
    return 'Administradora · Ventas y Operaciones';
  }
  if (user.id === FIXTURE_USERS.supervisorVentas.id || user.name.toLowerCase().includes('sergio')) {
    return 'Supervisor · Ventas';
  }
  if (user.id === FIXTURE_USERS.supervisorOperaciones.id || user.name.toLowerCase().includes('sofía')) {
    return 'Supervisora · Operaciones';
  }
  if (user.id === FIXTURE_USERS.empleadoOperaciones.id || user.name.toLowerCase().includes('emilio')) {
    return 'Empleado · Operaciones';
  }

  switch (user.role) {
    case 'ADMIN':
      return 'Administrador';
    case 'SUPERVISOR':
      return 'Supervisor';
    case 'EMPLOYEE':
      return 'Empleado';
    default:
      return user.role;
  }
}

function isItemActive(itemHref: string, pathname: string): boolean {
  if (itemHref === '/') {
    return pathname === '/';
  }
  return pathname === itemHref || pathname.startsWith(`${itemHref}/`);
}

export function Sidebar({ user, onLogout, pendingLogout = false, onNavigate }: SidebarProps) {
  const pathname = usePathname();
  const navId = useId();

  const visibleItems = NAV_ITEMS.filter(
    (item) => !item.roles || item.roles.includes(user.role),
  );

  const initials = getInitials(user.name);
  const roleDescription = formatUserRole(user);

  return (
    <aside
      aria-label="Navegación principal"
      className="flex h-full w-64 lg:w-72 flex-col justify-between bg-[#0B4233] p-5 text-white select-none shrink-0"
    >
      <div className="flex flex-col gap-6">
        {/* Logo de marca */}
        <Link
          href="/"
          onClick={onNavigate}
          className="flex items-center gap-3 rounded-xl px-2 py-2 transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E85114]"
        >
          <Image
            src="/hornero.png"
            alt=""
            width={34}
            height={44}
            className="h-10 w-auto object-contain shrink-0"
            priority
          />
          <span className="text-2xl font-extrabold tracking-tight text-white">
            pisp<span className="text-[#E85114]">IA</span>r
          </span>
        </Link>

        {/* Lista de navegación */}
        <nav id={navId} aria-label="Menú principal">
          <ul className="flex flex-col gap-1.5">
            {visibleItems.map((item) => {
              const active = isItemActive(item.href, pathname);
              const Icon = item.icon;

              return (
                <li key={item.id}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? 'page' : undefined}
                    aria-label={item.id === 'invitaciones' ? 'Invitar usuario' : undefined}
                    className={`relative flex items-center gap-3.5 rounded-xl px-3.5 py-2.5 text-[15px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E85114] ${
                      active
                        ? 'bg-[#135040] font-semibold text-white'
                        : 'text-[#9CC0B6] hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    {active && (
                      <span
                        aria-hidden="true"
                        className="absolute left-1.5 top-1/2 h-5 w-1.5 -translate-y-1/2 rounded-full bg-[#E85114]"
                      />
                    )}
                    <Icon className="size-5 shrink-0" />
                    <span>{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>

      <div className="flex flex-col gap-4">
        {/* Tarjeta ¿Dudas? Preguntale al hornero */}
        <Link
          href="/asistente"
          onClick={onNavigate}
          aria-label="Preguntale al asistente"
          className="relative flex items-center gap-3 overflow-hidden rounded-2xl bg-[#135040] p-3.5 transition-colors hover:bg-[#185d4b] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E85114]"
        >
          <div className="relative -ml-1 size-12 shrink-0">
            <Image
              src="/hornero.png"
              alt=""
              width={48}
              height={56}
              className="absolute bottom-0 left-0 h-14 w-auto max-w-none object-contain"
            />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-[#9CC0B6]">¿Dudas?</p>
            <p className="text-sm font-bold leading-tight text-white">Preguntale al hornero</p>
          </div>
        </Link>

        {/* Separador y perfil de usuario */}
        <div className="border-t border-[#135040]/70 pt-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <span
                aria-hidden="true"
                className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#E85114] text-sm font-bold text-white shadow-xs"
              >
                {initials}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-white" title={user.name}>
                  {user.name}
                </p>
                <p className="truncate text-xs text-[#9CC0B6]" title={roleDescription}>
                  {roleDescription}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => void onLogout()}
              disabled={pendingLogout}
              aria-label="Cerrar sesión"
              title="Cerrar sesión"
              className="flex size-9 shrink-0 items-center justify-center rounded-lg text-[#9CC0B6] transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E85114] disabled:opacity-50"
            >
              <LogoutIcon />
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
