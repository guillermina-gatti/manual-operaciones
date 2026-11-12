'use client';

import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { ApiError } from '@/lib/api/api-error';
import { notifyUsersChanged, updateUser } from '@/lib/api';
import type { AdminUserItem } from '@/lib/api';
import { areasDirectory, displayAreaName } from '@/lib/directory';
import type { Area } from '@/lib/directory';
import type { Role } from '@/lib/session';

interface EditUserModalProps {
  user: {
    id: string;
    name: string;
    email: string;
    role: Role;
    isActive: boolean;
    areaIds?: string[];
    areas?: { id: string; name: string }[];
  } | null;
  currentAdminId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (updated: AdminUserItem) => void;
}

export function EditUserModal({
  user,
  currentAdminId,
  isOpen,
  onClose,
  onSuccess,
}: EditUserModalProps) {
  const [role, setRole] = useState<Role>('EMPLOYEE');
  const [selectedAreaIds, setSelectedAreaIds] = useState<string[]>([]);
  const [isActive, setIsActive] = useState<boolean>(true);
  const [areas, setAreas] = useState<Area[]>([]);
  const [loadingAreas, setLoadingAreas] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const isSelf = user ? user.id === currentAdminId : false;

  useEffect(() => {
    let cancelled = false;
    async function loadAreas() {
      try {
        const list = await areasDirectory.listAreas();
        if (!cancelled) {
          setAreas(list.filter((a) => a.isActive !== false));
        }
      } catch {
        // Fallback en caso de error
      } finally {
        if (!cancelled) setLoadingAreas(false);
      }
    }
    void loadAreas();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (user) {
      setRole(user.role);
      setIsActive(user.isActive ?? true);
      const initialAreaIds = user.areaIds ?? user.areas?.map((a) => a.id) ?? [];
      setSelectedAreaIds(initialAreaIds);
      setError(null);
    }
  }, [user]);

  // Manejo de tecla Escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && isOpen && !saving) {
        onClose();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, saving, onClose]);

  if (!isOpen || !user) return null;

  function toggleArea(areaId: string) {
    setSelectedAreaIds((prev) =>
      prev.includes(areaId) ? prev.filter((id) => id !== areaId) : [...prev, areaId],
    );
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (role !== 'ADMIN' && selectedAreaIds.length === 0) {
      setError('Debés asignar al menos un área para un supervisor o empleado.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        role,
        areaIds: role === 'ADMIN' ? [] : selectedAreaIds,
        isActive,
      };

      const updated = await updateUser(user!.id, payload);
      notifyUsersChanged();
      onSuccess(updated);
      onClose();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Ocurrió un error inesperado al actualizar el usuario.');
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-user-title"
    >
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl transition-all sm:p-8">
        <div className="flex items-start justify-between border-b border-[#E6E9E7] pb-4">
          <div>
            <h2 id="edit-user-title" className="text-xl font-bold text-[#1E2B27]">
              Editar usuario
            </h2>
            <p className="mt-0.5 text-xs text-[#646F6A]">
              Modificá el rol, áreas asignadas o el estado de la cuenta.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg p-1.5 text-[#646F6A] hover:bg-[#F6F7F6] hover:text-[#1E2B27] disabled:opacity-50"
            aria-label="Cerrar modal"
          >
            <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Datos del usuario */}
        <div className="mt-4 rounded-xl bg-[#F6F7F6] p-3 text-sm">
          <div className="font-semibold text-[#1E2B27]">{user.name}</div>
          <div className="text-xs text-[#646F6A]">{user.email}</div>
        </div>

        {error && (
          <div
            role="alert"
            className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700"
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-5 space-y-5">
          {/* Rol */}
          <div>
            <label htmlFor="user-role-select" className="block text-xs font-bold uppercase tracking-wider text-[#646F6A]">
              Rol en el sistema
            </label>
            <select
              id="user-role-select"
              value={role}
              disabled={saving || isSelf}
              onChange={(e) => setRole(e.target.value as Role)}
              className="mt-1.5 w-full rounded-xl border border-[#E6E9E7] bg-white px-3 py-2 text-sm text-[#1E2B27] focus:border-[#0B4233] focus:outline-none disabled:bg-[#F6F7F6] disabled:text-[#646F6A]"
            >
              <option value="ADMIN">Administrador (acceso total)</option>
              <option value="SUPERVISOR">Supervisor (gestión de áreas)</option>
              <option value="EMPLOYEE">Empleado (ejecución y consulta)</option>
            </select>
            {isSelf && (
              <p className="mt-1 text-xs text-[#646F6A]">
                No podés modificar tu propio rol de administrador.
              </p>
            )}
          </div>

          {/* Áreas asignadas */}
          {role === 'ADMIN' ? (
            <div className="rounded-xl border border-[#E6E9E7] bg-[#F6F7F6] p-3 text-xs text-[#646F6A]">
              Los administradores tienen acceso global a todos los documentos y procedimientos, sin asignación de áreas específicas.
            </div>
          ) : (
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-[#646F6A]">
                Áreas asignadas <span className="text-red-500">*</span>
              </label>
              {loadingAreas ? (
                <div className="mt-2 text-xs text-[#646F6A]">Cargando áreas disponibles…</div>
              ) : areas.length === 0 ? (
                <div className="mt-2 text-xs text-[#646F6A]">No hay áreas activas registradas.</div>
              ) : (
                <div className="mt-2 max-h-36 overflow-y-auto space-y-1.5 rounded-xl border border-[#E6E9E7] p-3">
                  {areas.map((area) => (
                    <label
                      key={area.id}
                      className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1 text-xs text-[#1E2B27] hover:bg-[#F6F7F6]"
                    >
                      <input
                        type="checkbox"
                        checked={selectedAreaIds.includes(area.id)}
                        disabled={saving}
                        onChange={() => toggleArea(area.id)}
                        className="size-4 rounded text-[#0B4233] focus:ring-[#0B4233]"
                      />
                      <span>{displayAreaName(area)}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Estado de la cuenta */}
          <div className="border-t border-[#E6E9E7] pt-4">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm font-semibold text-[#1E2B27]">Cuenta activa</span>
                <p className="text-xs text-[#646F6A]">
                  {isActive
                    ? 'El usuario puede iniciar sesión y operar con normalidad.'
                    : 'La cuenta está desactivada y no podrá ingresar al sistema.'}
                </p>
              </div>
              <label className="relative inline-flex cursor-pointer items-center">
                <input
                  type="checkbox"
                  role="switch"
                  aria-label="Estado de cuenta activa"
                  checked={isActive}
                  disabled={saving || isSelf}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="peer sr-only"
                />
                <div className="h-6 w-11 rounded-full bg-[#E6E9E7] peer-checked:bg-[#0B4233] peer-focus:outline-hidden after:absolute after:top-0.5 after:left-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all peer-checked:after:translate-x-full peer-disabled:cursor-not-allowed peer-disabled:opacity-50" />
              </label>
            </div>
            {isSelf && (
              <p className="mt-1 text-xs text-[#646F6A]">
                No podés desactivar tu propia cuenta de administrador.
              </p>
            )}
            {!isActive && !isSelf && (
              <div className="mt-2 rounded-lg bg-amber-50 p-2.5 text-xs text-amber-800 border border-amber-200">
                Al desactivar la cuenta, se cerrarán inmediatamente todas las sesiones activas del usuario.
              </div>
            )}
          </div>

          {/* Botones de acción */}
          <div className="flex items-center justify-end gap-3 border-t border-[#E6E9E7] pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-xl border border-[#E6E9E7] px-4 py-2 text-xs font-semibold text-[#646F6A] hover:bg-[#F6F7F6] hover:text-[#1E2B27] disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-[#0B4233] px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-[#135040] focus:outline-none disabled:opacity-50"
            >
              {saving ? 'Guardando…' : 'Guardar cambios'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
