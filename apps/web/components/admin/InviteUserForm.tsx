'use client';

import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import Link from 'next/link';
import { ApiError } from '@/lib/api/api-error';
import { createInvitation, notifyInvitationsChanged } from '@/lib/api';
import type { CreatedInvitation } from '@/lib/api';
import { areasDirectory, displayAreaName } from '@/lib/directory';
import type { Area } from '@/lib/directory';

type Role = 'ADMIN' | 'SUPERVISOR' | 'EMPLOYEE';

function MailIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  );
}

function CheckIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

function CopyIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
  );
}

export function InviteUserForm() {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('EMPLOYEE');
  const [selectedAreaIds, setSelectedAreaIds] = useState<string[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [loadingAreas, setLoadingAreas] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdInvitation, setCreatedInvitation] = useState<CreatedInvitation | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function loadAreas() {
      try {
        const list = await areasDirectory.listAreas();
        if (!cancelled) {
          const active = list.filter((a) => a.isActive !== false);
          setAreas(active);
          setSelectedAreaIds((prev) => (prev.length === 0 && active.length > 0 ? [active[0].id] : prev));
        }
      } catch {
        if (!cancelled) {
          setError('No pudimos cargar las áreas del sistema. Actualizá la página.');
        }
      } finally {
        if (!cancelled) setLoadingAreas(false);
      }
    }
    void loadAreas();
    return () => {
      cancelled = true;
    };
  }, []);

  function toggleArea(areaId: string) {
    setSelectedAreaIds((prev) =>
      prev.includes(areaId) ? prev.filter((id) => id !== areaId) : [...prev, areaId],
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    setError(null);
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      setError('Ingresá un correo electrónico válido.');
      return;
    }

    if (role !== 'ADMIN' && selectedAreaIds.length === 0) {
      setError('Seleccioná al menos un área para este rol.');
      return;
    }

    setPending(true);
    try {
      const response = await createInvitation({
        email: cleanEmail,
        role,
        areaIds: role === 'ADMIN' ? [] : selectedAreaIds,
      });
      notifyInvitationsChanged?.();
      setCreatedInvitation(response);
      setCopied(false);
    } catch (cause) {
      if (cause instanceof ApiError) {
        if (cause.status === 409) {
          setError('Ya existe un usuario registrado con este correo o una invitación pendiente vigente.');
        } else if (cause.status === 400) {
          setError('Los datos enviados no son válidos. Revisá el correo y las áreas.');
        } else if (cause.status === 403) {
          setError('Solo los usuarios administradores pueden enviar invitaciones.');
        } else {
          setError('No pudimos emitir la invitación. Por favor probá de nuevo.');
        }
      } else {
        setError('Ocurrió un error inesperado al procesar la invitación.');
      }
    } finally {
      setPending(false);
    }
  }

  async function handleCopyLink() {
    if (!createdInvitation?.invitationUrl) return;
    try {
      await navigator.clipboard.writeText(createdInvitation.invitationUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      setCopied(false);
    }
  }

  function handleReset() {
    setEmail('');
    setRole('EMPLOYEE');
    if (areas.length > 0) {
      setSelectedAreaIds([areas[0].id]);
    }
    setError(null);
    setCreatedInvitation(null);
    setCopied(false);
  }

  // Estado de éxito tras enviar la invitación
  if (createdInvitation) {
    const assignedAreaNames = areas
      .filter((a) => createdInvitation.areaIds.includes(a.id))
      .map((a) => displayAreaName(a));

    return (
      <div className="rounded-2xl border border-emerald-200 bg-white p-6 sm:p-8 shadow-sm">
        <div className="flex items-center gap-3 text-emerald-800">
          <div className="flex size-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
            <CheckIcon className="size-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-[#0B4233]">¡Invitación emitida con éxito!</h2>
            <p className="text-xs text-zinc-600">
              El enlace es válido por 48 horas y puede usarse una sola vez.
            </p>
          </div>
        </div>

        <div className="mt-6 space-y-4 rounded-xl border border-zinc-100 bg-[#F4F6F5] p-5 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200/80 pb-3">
            <span className="font-medium text-zinc-500">Destinatario:</span>
            <span className="font-semibold text-zinc-900">{createdInvitation.email}</span>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200/80 pb-3">
            <span className="font-medium text-zinc-500">Rol asignado:</span>
            <span className="inline-flex items-center rounded-full bg-[#0B4233] px-3 py-0.5 text-xs font-semibold text-white">
              {createdInvitation.role}
            </span>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200/80 pb-3">
            <span className="font-medium text-zinc-500">Áreas asignadas:</span>
            <div className="flex flex-wrap gap-1.5">
              {createdInvitation.role === 'ADMIN' ? (
                <span className="text-xs text-zinc-500 italic">Acceso global a todas las áreas</span>
              ) : assignedAreaNames.length > 0 ? (
                assignedAreaNames.map((name) => (
                  <span
                    key={name}
                    className="inline-flex items-center rounded-full bg-white px-2.5 py-0.5 text-xs font-medium text-[#0B4233] border border-zinc-200"
                  >
                    {name}
                  </span>
                ))
              ) : (
                <span className="text-xs text-zinc-400">Sin áreas</span>
              )}
            </div>
          </div>

          {createdInvitation.invitationUrl && (
            <div className="pt-2">
              <label htmlFor="invitation-url-input" className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-zinc-700">
                Enlace de registro directo (entorno de pruebas)
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="invitation-url-input"
                  type="text"
                  readOnly
                  value={createdInvitation.invitationUrl}
                  className="min-h-11 w-full rounded-xl border border-zinc-300 bg-white px-3 text-xs text-zinc-800 select-all focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => void handleCopyLink()}
                  className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl bg-[#0B4233] px-4 text-xs font-semibold text-white shadow-sm transition hover:bg-[#083327]"
                >
                  <CopyIcon className="h-4 w-4" />
                  {copied ? '¡Copiado!' : 'Copiar'}
                </button>
              </div>
              <p className="mt-2 text-xs text-zinc-500">
                Podés copiar este enlace para probar el registro en una pestaña de incógnito, o{' '}
                <Link
                  href={createdInvitation.invitationUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-[#0B4233] underline hover:text-[#083327]"
                >
                  abrirlo directamente aquí
                </Link>
                .
              </p>
            </div>
          )}
        </div>

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={handleReset}
            className="min-h-11 rounded-xl bg-[#0B4233] px-6 text-sm font-semibold text-white shadow-sm transition hover:bg-[#083327]"
          >
            Invitar a otra persona
          </button>
        </div>
      </div>
    );
  }

  const isFormValid =
    email.trim().length > 0 &&
    (role === 'ADMIN' || selectedAreaIds.length > 0) &&
    !loadingAreas;

  return (
    <form onSubmit={(event) => void handleSubmit(event)} className="space-y-6 rounded-2xl border border-zinc-200/90 bg-white p-6 sm:p-8 shadow-sm" noValidate>
      <div>
        <label htmlFor="invite-email" className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-zinc-700">
          Correo electrónico
        </label>
        <div className="relative">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-zinc-400">
            <MailIcon className="h-5 w-5" />
          </div>
          <input
            id="invite-email"
            type="email"
            name="email"
            placeholder="nuevo.usuario@empresa.com"
            autoComplete="off"
            spellCheck={false}
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={pending}
            className="min-h-11 w-full rounded-xl border border-zinc-200 bg-white pl-10 pr-4 text-sm text-zinc-900 placeholder:text-zinc-400 transition focus:border-[#0B4233] focus:outline-none focus:ring-1 focus:ring-[#0B4233] disabled:opacity-60"
          />
        </div>
        <p className="mt-1 text-xs text-zinc-500">
          La persona invitada recibirá el enlace para definir su contraseña y activar su cuenta.
        </p>
      </div>

      <div>
        <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-zinc-700">
          Rol asignado
        </label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label
            className={`flex cursor-pointer flex-col justify-between rounded-xl border p-4 text-left transition ${
              role === 'EMPLOYEE'
                ? 'border-[#0B4233] bg-[#F4F6F5] ring-1 ring-[#0B4233]'
                : 'border-zinc-200 hover:border-zinc-300'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-zinc-900">Empleado</span>
              <input
                type="radio"
                name="role"
                value="EMPLOYEE"
                checked={role === 'EMPLOYEE'}
                onChange={() => setRole('EMPLOYEE')}
                className="h-4 w-4 text-[#0B4233] focus:ring-[#0B4233]"
              />
            </div>
            <p className="mt-2 text-xs text-zinc-500">
              Consulta documentos de sus áreas, ejecuta procedimientos y usa el asistente.
            </p>
          </label>

          <label
            className={`flex cursor-pointer flex-col justify-between rounded-xl border p-4 text-left transition ${
              role === 'SUPERVISOR'
                ? 'border-[#0B4233] bg-[#F4F6F5] ring-1 ring-[#0B4233]'
                : 'border-zinc-200 hover:border-zinc-300'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-zinc-900">Supervisor</span>
              <input
                type="radio"
                name="role"
                value="SUPERVISOR"
                checked={role === 'SUPERVISOR'}
                onChange={() => setRole('SUPERVISOR')}
                className="h-4 w-4 text-[#0B4233] focus:ring-[#0B4233]"
              />
            </div>
            <p className="mt-2 text-xs text-zinc-500">
              Supervisa el avance de su equipo, accede a métricas de su área y gestiona borradores.
            </p>
          </label>

          <label
            className={`flex cursor-pointer flex-col justify-between rounded-xl border p-4 text-left transition ${
              role === 'ADMIN'
                ? 'border-[#0B4233] bg-[#F4F6F5] ring-1 ring-[#0B4233]'
                : 'border-zinc-200 hover:border-zinc-300'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-zinc-900">Admin</span>
              <input
                type="radio"
                name="role"
                value="ADMIN"
                checked={role === 'ADMIN'}
                onChange={() => setRole('ADMIN')}
                className="h-4 w-4 text-[#0B4233] focus:ring-[#0B4233]"
              />
            </div>
            <p className="mt-2 text-xs text-zinc-500">
              Acceso global a todas las áreas, configuración general y emisión de invitaciones.
            </p>
          </label>
        </div>
      </div>

      <div>
        <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-zinc-700">
          Áreas asignadas
        </label>
        {role === 'ADMIN' ? (
          <div className="rounded-xl border border-zinc-200 bg-[#F4F6F5] p-4 text-xs text-zinc-600">
            <p className="font-semibold text-[#0B4233]">Acceso global sin restricción de áreas</p>
            <p className="mt-1">
              Las cuentas con rol <strong>Administrador</strong> tienen acceso automático a los documentos, procedimientos y métricas de todas las áreas de la empresa.
            </p>
          </div>
        ) : loadingAreas ? (
          <p className="text-xs text-zinc-500">Cargando áreas disponibles…</p>
        ) : areas.length === 0 ? (
          <p className="text-xs text-amber-700">No se encontraron áreas activas en el sistema.</p>
        ) : (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2.5">
              {areas.map((area) => {
                const checked = selectedAreaIds.includes(area.id);
                return (
                  <label
                    key={area.id}
                    className={`inline-flex items-center gap-2 cursor-pointer rounded-xl border px-3.5 py-2 text-xs font-medium transition ${
                      checked
                        ? 'border-[#0B4233] bg-[#E3F7DD] text-[#0B4233]'
                        : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleArea(area.id)}
                      disabled={pending}
                      className="h-4 w-4 rounded border-zinc-300 text-[#0B4233] focus:ring-[#0B4233]"
                    />
                    <span>{displayAreaName(area)}</span>
                  </label>
                );
              })}
            </div>
            {selectedAreaIds.length === 0 && (
              <p className="text-xs text-amber-700">
                Seleccioná al menos un área para este usuario.
              </p>
            )}
          </div>
        )}
      </div>

      {error && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800 border border-red-200">
          {error}
        </p>
      )}

      <div className="pt-2">
        <button
          type="submit"
          disabled={pending || !isFormValid}
          className="min-h-11 w-full rounded-xl bg-[#0B4233] px-6 text-sm font-semibold text-white shadow-sm transition hover:bg-[#083327] disabled:opacity-50 disabled:cursor-not-allowed sm:w-auto"
        >
          {pending ? 'Enviando invitación…' : 'Enviar invitación'}
        </button>
      </div>
    </form>
  );
}
