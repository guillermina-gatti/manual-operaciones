'use client';

import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { ApiError } from '@/lib/api/api-error';
import { notifyAreasChanged, updateArea } from '@/lib/api';
import type { AreaItem } from '@/lib/api';

interface EditAreaModalProps {
  area: AreaItem | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (updated: AreaItem) => void;
}

export function EditAreaModal({ area, isOpen, onClose, onSuccess }: EditAreaModalProps) {
  const [name, setName] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (area) {
      setName(area.name);
      setIsActive(area.isActive);
      setError(null);
    }
  }, [area]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && isOpen && !saving) {
        onClose();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, saving, onClose]);

  if (!isOpen || !area) return null;

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const trimmed = name.trim();
    if (!trimmed) {
      setError('El nombre del área es obligatorio.');
      return;
    }

    if (trimmed.length < 2) {
      setError('El nombre del área debe tener al menos 2 caracteres.');
      return;
    }

    setSaving(true);
    try {
      const updated = await updateArea(area!.id, {
        name: trimmed,
        isActive,
      });
      notifyAreasChanged();
      onSuccess(updated);
      onClose();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Ocurrió un error inesperado al actualizar el área.');
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
      aria-labelledby="edit-area-title"
    >
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl transition-all sm:p-8">
        <div className="flex items-start justify-between border-b border-[#E6E9E7] pb-4">
          <div>
            <h2 id="edit-area-title" className="text-xl font-bold text-[#1E2B27]">
              Editar área
            </h2>
            <p className="mt-0.5 text-xs text-[#646F6A]">
              Modificá el nombre o activá/desactivá el área en la organización.
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

        {error && (
          <div
            role="alert"
            className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700"
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label htmlFor="edit-area-name-input" className="block text-xs font-bold uppercase tracking-wider text-[#646F6A]">
              Nombre del área <span className="text-red-500">*</span>
            </label>
            <input
              id="edit-area-name-input"
              type="text"
              value={name}
              disabled={saving}
              onChange={(e) => setName(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-[#E6E9E7] bg-white px-3 py-2 text-sm text-[#1E2B27] focus:border-[#0B4233] focus:outline-none"
            />
          </div>

          <div className="border-t border-[#E6E9E7] pt-4">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm font-semibold text-[#1E2B27]">Área activa</span>
                <p className="text-xs text-[#646F6A]">
                  {isActive
                    ? 'Disponible para vincular documentos, procedimientos y usuarios.'
                    : 'Inactiva para nuevas altas o asignaciones.'}
                </p>
              </div>
              <label className="relative inline-flex cursor-pointer items-center">
                <input
                  type="checkbox"
                  role="switch"
                  aria-label="Estado activo del área"
                  checked={isActive}
                  disabled={saving}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="peer sr-only"
                />
                <div className="h-6 w-11 rounded-full bg-[#E6E9E7] peer-checked:bg-[#0B4233] peer-focus:outline-hidden after:absolute after:top-0.5 after:left-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all peer-checked:after:translate-x-full peer-disabled:cursor-not-allowed peer-disabled:opacity-50" />
              </label>
            </div>
            {!isActive && (
              <div className="mt-2 rounded-lg bg-amber-50 p-2.5 text-xs text-amber-800 border border-amber-200">
                Al desactivar el área, no estará disponible para nuevos documentos ni invitaciones.
              </div>
            )}
          </div>

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
