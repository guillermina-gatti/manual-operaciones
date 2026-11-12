'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { getInitials } from '@/components/navigation/Sidebar';
import { listAdminUsers, USERS_CHANGED_EVENT } from '@/lib/api';
import type { SessionUser } from '@/lib/session';
import {
  DEFAULT_MANAGED_USERS,
  getSupervisorAreas,
  getUsersUnderCharge,
} from '@/lib/users/managed-users';
import type { ManagedUser } from '@/lib/users/managed-users';
import { EditUserModal } from './EditUserModal';

interface UsersAndRolesViewProps {
  user: SessionUser;
  catalog?: readonly ManagedUser[];
}

function UserPlusIcon({ className = 'size-4' }: { className?: string }) {
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

function SearchIcon({ className = 'size-4' }: { className?: string }) {
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
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function MailIcon({ className = 'size-4' }: { className?: string }) {
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
      <rect width="20" height="16" x="2" y="4" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </svg>
  );
}

function BuildingIcon({ className = 'size-4' }: { className?: string }) {
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

function EditIcon({ className = 'size-3.5' }: { className?: string }) {
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
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

export function UsersAndRolesView({ user, catalog = DEFAULT_MANAGED_USERS }: UsersAndRolesViewProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRole, setSelectedRole] = useState<'ALL' | 'SUPERVISOR' | 'EMPLOYEE'>('ALL');
  const [liveUsers, setLiveUsers] = useState<ManagedUser[] | null>(null);
  const [editingUser, setEditingUser] = useState<ManagedUser | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  const isAdmin = user.role === 'ADMIN';
  const isSupervisor = user.role === 'SUPERVISOR';

  // Carga de usuarios reales para ADMIN con actualización reactiva
  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;

    async function loadLiveUsers() {
      try {
        const users = await listAdminUsers();
        if (!cancelled && Array.isArray(users)) {
          const mapped: ManagedUser[] = users.map((u) => ({
            id: u.id,
            name: u.name,
            email: u.email,
            role: u.role,
            isActive: u.isActive,
            areaIds: u.areas.map((a) => a.id),
            areaNames:
              u.areas.length > 0
                ? u.areas.map((a) => a.name)
                : u.role === 'ADMIN'
                ? ['Todas las áreas']
                : ['Sin áreas asignadas'],
          }));
          setLiveUsers(mapped);
        }
      } catch {
        // En caso de error o entorno de tests sin mock HTTP, se preserva catalog
      }
    }

    void loadLiveUsers();

    function handleUsersChanged() {
      void loadLiveUsers();
    }

    window.addEventListener(USERS_CHANGED_EVENT, handleUsersChanged);
    return () => {
      cancelled = true;
      window.removeEventListener(USERS_CHANGED_EVENT, handleUsersChanged);
    };
  }, [isAdmin]);

  const effectiveCatalog = liveUsers ?? catalog;

  // Obtener los usuarios bajo cargo de la sesión actual
  const usersUnderCharge = useMemo(
    () => getUsersUnderCharge(user, effectiveCatalog),
    [user, effectiveCatalog],
  );

  const supervisorAreas = useMemo(() => getSupervisorAreas(user), [user]);

  // Filtrado por búsqueda y rol
  const filteredUsers = useMemo(() => {
    return usersUnderCharge.filter((u) => {
      const matchesSearch =
        u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        u.email.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesRole =
        selectedRole === 'ALL' ? true : u.role === selectedRole;
      return matchesSearch && matchesRole;
    });
  }, [usersUnderCharge, searchTerm, selectedRole]);

  return (
    <main className="min-h-full px-4 py-8 sm:px-8 sm:py-10">
      <div className="mx-auto max-w-6xl space-y-6">
        {/* Breadcrumb */}
        <nav aria-label="Miga de pan" className="flex items-center gap-2 text-xs text-[#646F6A]">
          <Link href="/" className="hover:text-[#0B4233] hover:underline">
            Inicio
          </Link>
          <span>/</span>
          <span className="font-medium text-[#1E2B27]">Administración</span>
          <span>/</span>
          <span className="font-semibold text-[#0B4233]">Usuarios y roles a cargo</span>
        </nav>

        {/* Encabezado con título y acción */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-[#0B4233] sm:text-3xl">
              Usuarios y roles a cargo
            </h1>
            <p className="mt-1 text-sm text-[#646F6A]">
              {isAdmin
                ? 'Personal y roles de toda la organización bajo tu dirección general.'
                : 'Personal subordinado bajo tu supervisión directa.'}
            </p>
          </div>

          {isAdmin && (
            <Link
              href="/admin/invitaciones"
              className="inline-flex items-center gap-2 rounded-xl bg-[#0B4233] px-4 py-2.5 text-sm font-semibold text-white shadow-xs transition-colors hover:bg-[#135040] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E85114]"
            >
              <UserPlusIcon className="size-4" />
              <span>Invitar nuevo usuario</span>
            </Link>
          )}
        </div>

        {/* Barra de control y métricas */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between rounded-2xl border border-[#E6E9E7] bg-white p-4 shadow-xs">
          {/* Campo de búsqueda */}
          <div className="relative flex-1 max-w-md">
            <SearchIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-[#646F6A]" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por nombre o correo…"
              aria-label="Buscar usuarios a cargo"
              className="w-full rounded-xl border border-[#E6E9E7] bg-[#F6F7F6] py-2 pl-10 pr-4 text-sm text-[#1E2B27] placeholder-[#646F6A] focus:border-[#0B4233] focus:bg-white focus:outline-none"
            />
          </div>

          {/* Filtros de rol */}
          {isAdmin && (
            <div className="flex items-center gap-1.5" role="group" aria-label="Filtrar por rol">
              <button
                type="button"
                onClick={() => setSelectedRole('ALL')}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                  selectedRole === 'ALL'
                    ? 'bg-[#0B4233] text-white'
                    : 'bg-[#F6F7F6] text-[#646F6A] hover:bg-[#E6E9E7]'
                }`}
              >
                Todos ({usersUnderCharge.length})
              </button>
              <button
                type="button"
                onClick={() => setSelectedRole('SUPERVISOR')}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                  selectedRole === 'SUPERVISOR'
                    ? 'bg-[#0B4233] text-white'
                    : 'bg-[#F6F7F6] text-[#646F6A] hover:bg-[#E6E9E7]'
                }`}
              >
                Supervisores (
                {usersUnderCharge.filter((u) => u.role === 'SUPERVISOR').length})
              </button>
              <button
                type="button"
                onClick={() => setSelectedRole('EMPLOYEE')}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                  selectedRole === 'EMPLOYEE'
                    ? 'bg-[#0B4233] text-white'
                    : 'bg-[#F6F7F6] text-[#646F6A] hover:bg-[#E6E9E7]'
                }`}
              >
                Empleados (
                {usersUnderCharge.filter((u) => u.role === 'EMPLOYEE').length})
              </button>
            </div>
          )}

          {isSupervisor && (
            <div className="flex items-center gap-2 text-xs font-medium text-[#0B4233] bg-[#EAF2EF] px-3 py-1.5 rounded-lg border border-[#0B4233]/20">
              <BuildingIcon className="size-4 shrink-0 text-[#0B4233]" />
              <span>
                Personal a cargo ({usersUnderCharge.length})
              </span>
            </div>
          )}
        </div>

        {/* Lista de usuarios a cargo */}
        {filteredUsers.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#E6E9E7] bg-white p-12 text-center">
            <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-[#F6F7F6] text-[#646F6A]">
              <SearchIcon className="size-6" />
            </div>
            <h3 className="mt-4 text-base font-bold text-[#1E2B27]">
              No se encontraron usuarios a cargo
            </h3>
            <p className="mt-1 text-sm text-[#646F6A]">
              {searchTerm
                ? 'Probá ajustando los términos de búsqueda o quitando los filtros.'
                : 'No tenés colaboradores asignados bajo tu supervisión directa actualmente.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredUsers.map((u) => {
              const initials = getInitials(u.name);
              return (
                <div
                  key={u.id}
                  data-testid={`user-card-${u.id}`}
                  className="flex flex-col justify-between rounded-2xl border border-[#E6E9E7] bg-white p-5 shadow-xs transition-shadow hover:shadow-md"
                >
                  <div className="space-y-4">
                    {/* Fila superior: avatar, nombre y estado */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <span
                          aria-hidden="true"
                          className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[#E85114] text-sm font-bold text-white shadow-xs"
                        >
                          {initials}
                        </span>
                        <div className="min-w-0 flex-1">
                          <h2
                            className="truncate text-base font-bold text-[#1E2B27]"
                            title={u.name}
                          >
                            {u.name}
                          </h2>
                          <div className="mt-0.5 flex items-center gap-1.5 text-xs text-[#646F6A]">
                            <span
                              className={`flex size-2 rounded-full ${
                                u.isActive !== false ? 'bg-emerald-500' : 'bg-rose-500'
                              }`}
                            />
                            <span>{u.isActive !== false ? 'Activo' : 'Inactivo'}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Email */}
                    <div className="flex items-center gap-2 text-xs text-[#646F6A]">
                      <MailIcon className="size-3.5 shrink-0" />
                      <span className="truncate" title={u.email}>
                        {u.email}
                      </span>
                    </div>

                    {/* Áreas asignadas */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      <BuildingIcon className="size-3.5 text-[#646F6A] shrink-0" />
                      {u.areaNames.map((areaName) => (
                        <span
                          key={areaName}
                          className="rounded-md bg-[#F4F6F5] px-2 py-0.5 text-xs font-medium text-[#33413B]"
                        >
                          {areaName}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Fila inferior: Rol y acción de edición */}
                  <div className="mt-4 flex items-center justify-between border-t border-[#E6E9E7]/60 pt-3">
                    <span
                      className={`inline-flex items-center rounded-lg px-2.5 py-1 text-xs font-semibold ${
                        u.role === 'SUPERVISOR'
                          ? 'bg-[#EAF2EF] text-[#0B4233] border border-[#0B4233]/20'
                          : u.role === 'ADMIN'
                          ? 'bg-[#0B4233] text-white'
                          : 'bg-[#F6F7F6] text-[#646F6A] border border-[#E6E9E7]'
                      }`}
                    >
                      {u.role === 'SUPERVISOR'
                        ? 'Supervisor'
                        : u.role === 'ADMIN'
                        ? 'Administrador'
                        : 'Empleado'}
                    </span>

                    {isAdmin && (
                      <button
                        type="button"
                        data-testid={`edit-user-${u.id}`}
                        onClick={() => {
                          setEditingUser(u);
                          setIsEditModalOpen(true);
                        }}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-[#E6E9E7] bg-white px-2.5 py-1 text-xs font-semibold text-[#646F6A] shadow-2xs transition-colors hover:bg-[#F6F7F6] hover:text-[#0B4233]"
                      >
                        <EditIcon className="size-3.5" />
                        <span>Editar</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {isAdmin && (
        <EditUserModal
          user={editingUser}
          currentAdminId={user.id}
          isOpen={isEditModalOpen}
          onClose={() => {
            setIsEditModalOpen(false);
            setEditingUser(null);
          }}
          onSuccess={(updated) => {
            setLiveUsers((prev) => {
              const current = prev ?? [...catalog];
              return current.map((item) =>
                item.id === updated.id
                  ? {
                      id: updated.id,
                      name: updated.name,
                      email: updated.email,
                      role: updated.role,
                      isActive: updated.isActive,
                      areaIds: updated.areas.map((a) => a.id),
                      areaNames:
                        updated.areas.length > 0
                          ? updated.areas.map((a) => a.name)
                          : updated.role === 'ADMIN'
                          ? ['Todas las áreas']
                          : ['Sin áreas asignadas'],
                    }
                  : item,
              );
            });
          }}
        />
      )}
    </main>
  );
}
