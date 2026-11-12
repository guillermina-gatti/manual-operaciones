'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { CONFLICT_ALERTS_CHANGED_EVENT, listConflictAlerts, useApiResource } from '@/lib/api';
import { FIXTURE_USERS } from '@/lib/directory/fixtures';
import { REAL_AUTH_ENABLED } from '@/lib/session';
import type { Role, SessionUser } from '@/lib/session';
import { selectDevUser } from '@/lib/session/simulated-session';

interface TopBarProps {
  user: SessionUser;
  onOpenMobileMenu: () => void;
}

const describeOpen = (total: number) =>
  total === 0 ? 'ninguna abierta' : total === 1 ? '1 abierta' : `${total} abiertas`;

function BellIcon({ className = 'size-5' }: { className?: string }) {
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
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

function MenuIcon({ className = 'size-6' }: { className?: string }) {
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
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="4" y1="18" x2="20" y2="18" />
    </svg>
  );
}

function SwapIcon({ className = 'size-4' }: { className?: string }) {
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
      <path d="m16 3 4 4-4 4" />
      <path d="M20 7H4" />
      <path d="m8 21-4-4 4-4" />
      <path d="M4 17h16" />
    </svg>
  );
}

export function AdminAlertsBell({ userId }: { userId: string }) {
  const pathname = usePathname();
  const isFirstRender = useRef(true);
  const open = useApiResource(`conflict-alerts-count:${userId}`, (signal) =>
    listConflictAlerts('OPEN', 1, 1, signal),
  );
  const { reload } = open;

  useEffect(() => {
    function onAlertsChanged() {
      reload();
    }
    window.addEventListener(CONFLICT_ALERTS_CHANGED_EVENT, onAlertsChanged);
    return () => {
      window.removeEventListener(CONFLICT_ALERTS_CHANGED_EVENT, onAlertsChanged);
    };
  }, [reload]);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    reload();
  }, [pathname, reload]);

  const openTotal = open.status === 'success' ? open.data.openTotal : 0;
  const label =
    open.status === 'success' ? `Alertas: ${describeOpen(openTotal)}` : 'Alertas';

  return (
    <Link
      href="/documentos/alertas"
      aria-label={label}
      title={label}
      className="relative flex size-10 items-center justify-center rounded-full border border-[#E6E9E7] bg-white text-[#1E2B27] shadow-xs transition-colors hover:bg-[#EEF3F0] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E85114]"
    >
      <BellIcon className="size-5 text-[#1E2B27]" />
      {open.status === 'success' && openTotal > 0 && (
        <span
          data-testid="alerts-badge"
          className="absolute -top-1 -right-1 flex min-w-5 h-5 items-center justify-center rounded-full bg-[#E85114] px-1 text-[11px] font-bold text-white shadow-xs"
        >
          {openTotal}
        </span>
      )}
    </Link>
  );
}

const ROLE_SHORT_NAMES: Record<Role, string> = {
  ADMIN: 'Ana',
  SUPERVISOR: 'Sergio',
  EMPLOYEE: 'Elena',
};

const DEV_FIXTURES = [
  { id: FIXTURE_USERS.admin.id, name: 'Ana', role: 'ADMIN' as const },
  { id: FIXTURE_USERS.supervisorVentas.id, name: 'Sergio', role: 'SUPERVISOR' as const },
  { id: FIXTURE_USERS.empleadoVentas.id, name: 'Elena', role: 'EMPLOYEE' as const },
];

export function TopBar({ user, onOpenMobileMenu }: TopBarProps) {
  const currentShortName =
    DEV_FIXTURES.find((f) => f.id === user.id)?.name ||
    ROLE_SHORT_NAMES[user.role] ||
    user.name.split(' ')[0];

  return (
    <header className="flex h-16 w-full items-center justify-between border-b border-[#E6E9E7]/60 bg-transparent px-4 sm:px-6">
      {/* Botón hamburguesa en móvil */}
      <div className="flex items-center gap-3 md:hidden">
        <button
          type="button"
          onClick={onOpenMobileMenu}
          aria-label="Abrir menú"
          className="flex size-10 items-center justify-center rounded-xl border border-[#E6E9E7] bg-white text-[#0B4233] shadow-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E85114]"
        >
          <MenuIcon className="size-5" />
        </button>
        <span className="text-xl font-extrabold text-[#0B4233]">
          pisp<span className="text-[#E85114]">IA</span>r
        </span>
      </div>

      <div className="hidden md:block" />

      {/* Acciones superiores derechas: Ver como + Campana de Alertas */}
      <div className="flex items-center gap-3">
        {!REAL_AUTH_ENABLED && (
          <div className="relative inline-flex items-center">
            <label htmlFor="top-dev-switcher" className="sr-only">
              Cambiar usuario de prueba
            </label>
            <div className="flex items-center gap-2 rounded-xl border border-[#E6E9E7] bg-white px-3 py-1.5 text-sm font-medium text-[#1E2B27] shadow-xs">
              <SwapIcon className="size-4 text-[#646F6A]" />
              <span className="text-[#646F6A]">Ver como:</span>
              <select
                id="top-dev-switcher"
                value={user.id}
                onChange={(e) => void selectDevUser(e.target.value || null)}
                className="bg-transparent font-bold text-[#1E2B27] cursor-pointer focus:outline-none"
              >
                {DEV_FIXTURES.map((fixture) => (
                  <option key={fixture.id} value={fixture.id}>
                    {fixture.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {user.role === 'ADMIN' ? (
          <AdminAlertsBell userId={user.id} />
        ) : (
          <button
            type="button"
            aria-label="Notificaciones"
            disabled
            className="flex size-10 items-center justify-center rounded-full border border-[#E6E9E7] bg-white text-[#646F6A] shadow-xs opacity-60"
          >
            <BellIcon className="size-5" />
          </button>
        )}
      </div>
    </header>
  );
}
