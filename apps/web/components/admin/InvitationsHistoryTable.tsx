'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  INVITATIONS_CHANGED_EVENT,
  listInvitations,
  notifyInvitationsChanged,
  revokeInvitation,
  useApiResource,
} from '@/lib/api';
import type { InvitationListItem, InvitationStatus } from '@/lib/api';

function TrashIcon({ className = 'size-4' }: { className?: string }) {
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
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

function RefreshIcon({ className = 'size-4' }: { className?: string }) {
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
      <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
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

const STATUS_LABELS: Record<InvitationStatus, string> = {
  PENDING: 'Pendiente',
  ACCEPTED: 'Aceptada',
  REVOKED: 'Revocada',
  EXPIRED: 'Vencida',
};

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Administrador',
  SUPERVISOR: 'Supervisor',
  EMPLOYEE: 'Empleado',
};

export function InvitationsHistoryTable() {
  const resource = useApiResource('admin-invitations-list', (signal) =>
    listInvitations(signal),
  );
  const { reload } = resource;

  const [filterStatus, setFilterStatus] = useState<'ALL' | InvitationStatus>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmRevokeId, setConfirmRevokeId] = useState<string | null>(null);

  // Recargar cuando se emita una nueva invitación desde el formulario
  useEffect(() => {
    function handleChanged() {
      reload();
    }
    window.addEventListener(INVITATIONS_CHANGED_EVENT, handleChanged);
    return () => {
      window.removeEventListener(INVITATIONS_CHANGED_EVENT, handleChanged);
    };
  }, [reload]);

  const items = resource.status === 'success' ? resource.data : [];

  const filteredItems = useMemo(() => {
    return items.filter((inv) => {
      const matchesStatus =
        filterStatus === 'ALL' ? true : inv.status === filterStatus;
      const matchesSearch =
        inv.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        inv.role.toLowerCase().includes(searchTerm.toLowerCase()) ||
        inv.areaNames.some((a) => a.toLowerCase().includes(searchTerm.toLowerCase()));
      return matchesStatus && matchesSearch;
    });
  }, [items, filterStatus, searchTerm]);

  async function handleRevoke(id: string) {
    setRevokingId(id);
    setActionError(null);
    try {
      await revokeInvitation(id);
      notifyInvitationsChanged();
      setConfirmRevokeId(null);
      reload();
    } catch {
      setActionError('No se pudo revocar la invitación. Intentá de nuevo.');
    } finally {
      setRevokingId(null);
    }
  }

  const counts = useMemo(() => {
    return {
      all: items.length,
      pending: items.filter((i) => i.status === 'PENDING').length,
      accepted: items.filter((i) => i.status === 'ACCEPTED').length,
      revoked: items.filter((i) => i.status === 'REVOKED').length,
      expired: items.filter((i) => i.status === 'EXPIRED').length,
    };
  }, [items]);

  return (
    <section
      data-testid="invitations-history-section"
      className="space-y-4 rounded-2xl border border-[#E6E9E7] bg-white p-6 shadow-xs"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-[#0B4233]">
            Historial de invitaciones
          </h2>
          <p className="text-xs text-[#646F6A]">
            Seguimiento de enlaces de registro emitidos, estado de canje y revocación.
          </p>
        </div>

        <button
          type="button"
          onClick={() => reload()}
          disabled={resource.status === 'loading'}
          aria-label="Actualizar listado de invitaciones"
          className="inline-flex items-center gap-1.5 rounded-xl border border-[#E6E9E7] bg-white px-3 py-1.5 text-xs font-semibold text-[#1E2B27] shadow-xs hover:bg-[#F6F7F6] focus-visible:outline-2 focus-visible:outline-[#E85114] disabled:opacity-50"
        >
          <RefreshIcon
            className={`size-3.5 ${resource.status === 'loading' ? 'animate-spin' : ''}`}
          />
          <span>Actualizar</span>
        </button>
      </div>

      {actionError && (
        <div
          role="alert"
          className="rounded-xl bg-[#FCE1E4] px-4 py-2.5 text-xs font-semibold text-[#B4232C]"
        >
          {actionError}
        </div>
      )}

      {/* Controles de filtro y búsqueda */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-sm">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-[#646F6A]" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por correo o área…"
            aria-label="Buscar invitación"
            className="w-full rounded-xl border border-[#E6E9E7] bg-[#F6F7F6] py-1.5 pl-9 pr-3 text-xs text-[#1E2B27] placeholder-[#646F6A] focus:border-[#0B4233] focus:bg-white focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Filtrar por estado">
          <button
            type="button"
            onClick={() => setFilterStatus('ALL')}
            className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
              filterStatus === 'ALL'
                ? 'bg-[#0B4233] text-white'
                : 'bg-[#F6F7F6] text-[#646F6A] hover:bg-[#E6E9E7]'
            }`}
          >
            Todas ({counts.all})
          </button>
          <button
            type="button"
            onClick={() => setFilterStatus('PENDING')}
            className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
              filterStatus === 'PENDING'
                ? 'bg-[#E85114] text-white'
                : 'bg-[#F6F7F6] text-[#646F6A] hover:bg-[#E6E9E7]'
            }`}
          >
            Pendientes ({counts.pending})
          </button>
          <button
            type="button"
            onClick={() => setFilterStatus('ACCEPTED')}
            className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
              filterStatus === 'ACCEPTED'
                ? 'bg-emerald-700 text-white'
                : 'bg-[#F6F7F6] text-[#646F6A] hover:bg-[#E6E9E7]'
            }`}
          >
            Aceptadas ({counts.accepted})
          </button>
          <button
            type="button"
            onClick={() => setFilterStatus('REVOKED')}
            className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
              filterStatus === 'REVOKED'
                ? 'bg-rose-700 text-white'
                : 'bg-[#F6F7F6] text-[#646F6A] hover:bg-[#E6E9E7]'
            }`}
          >
            Revocadas ({counts.revoked})
          </button>
          <button
            type="button"
            onClick={() => setFilterStatus('EXPIRED')}
            className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
              filterStatus === 'EXPIRED'
                ? 'bg-zinc-700 text-white'
                : 'bg-[#F6F7F6] text-[#646F6A] hover:bg-[#E6E9E7]'
            }`}
          >
            Vencidas ({counts.expired})
          </button>
        </div>
      </div>

      {/* Tabla de invitaciones */}
      {resource.status === 'loading' ? (
        <div className="py-12 text-center text-xs text-[#646F6A]">
          <span role="status">Cargando historial de invitaciones…</span>
        </div>
      ) : resource.status === 'error' ? (
        <div className="rounded-xl border border-[#FCE1E4] bg-[#FCE1E4]/40 p-6 text-center text-xs text-[#B4232C]">
          <p>No se pudo cargar el historial de invitaciones.</p>
          <button
            type="button"
            onClick={() => reload()}
            className="mt-2 font-semibold underline hover:text-[#7A151C]"
          >
            Reintentar
          </button>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#E6E9E7] p-8 text-center text-xs text-[#646F6A]">
          {searchTerm || filterStatus !== 'ALL'
            ? 'No hay invitaciones que coincidan con los filtros aplicados.'
            : 'Todavía no se emitieron invitaciones en el sistema.'}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-[#E6E9E7] bg-[#F6F7F6] text-[#646F6A]">
              <tr>
                <th className="px-3.5 py-2.5 font-semibold">Destinatario</th>
                <th className="px-3.5 py-2.5 font-semibold">Rol</th>
                <th className="px-3.5 py-2.5 font-semibold">Área(s)</th>
                <th className="px-3.5 py-2.5 font-semibold">Estado</th>
                <th className="px-3.5 py-2.5 font-semibold">Vencimiento</th>
                <th className="px-3.5 py-2.5 font-semibold text-right">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E6E9E7]">
              {filteredItems.map((inv) => {
                const isPending = inv.status === 'PENDING';
                const isConfirming = confirmRevokeId === inv.id;
                const isProcessing = revokingId === inv.id;

                return (
                  <tr
                    key={inv.id}
                    data-testid={`invitation-row-${inv.id}`}
                    className="hover:bg-[#F6F7F6]/50 transition-colors"
                  >
                    <td className="px-3.5 py-3 font-medium text-[#1E2B27]">
                      {inv.email}
                    </td>
                    <td className="px-3.5 py-3 text-[#1E2B27]">
                      {ROLE_LABELS[inv.role] || inv.role}
                    </td>
                    <td className="px-3.5 py-3 text-[#646F6A]">
                      {inv.areaNames.length > 0
                        ? inv.areaNames.join(', ')
                        : '—'}
                    </td>
                    <td className="px-3.5 py-3">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          inv.status === 'PENDING'
                            ? 'bg-[#FFF3E8] text-[#E85114]'
                            : inv.status === 'ACCEPTED'
                            ? 'bg-[#EAF2EF] text-[#0B4233]'
                            : inv.status === 'REVOKED'
                            ? 'bg-[#FCE1E4] text-[#B4232C]'
                            : 'bg-zinc-100 text-zinc-600'
                        }`}
                      >
                        {inv.status === 'PENDING' && (
                          <span className="size-1.5 rounded-full bg-[#E85114] animate-pulse" />
                        )}
                        {STATUS_LABELS[inv.status]}
                      </span>
                    </td>
                    <td className="px-3.5 py-3 text-[#646F6A]">
                      {new Date(inv.expiresAt).toLocaleDateString('es-AR', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="px-3.5 py-3 text-right">
                      {isPending ? (
                        isConfirming ? (
                          <div className="inline-flex items-center gap-1.5">
                            <span className="text-[11px] text-[#B4232C] font-semibold">
                              ¿Revocar?
                            </span>
                            <button
                              type="button"
                              onClick={() => void handleRevoke(inv.id)}
                              disabled={isProcessing}
                              className="rounded-md bg-[#B4232C] px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-[#8F1B22] disabled:opacity-50"
                            >
                              {isProcessing ? '…' : 'Sí'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmRevokeId(null)}
                              disabled={isProcessing}
                              className="rounded-md bg-[#E6E9E7] px-2 py-0.5 text-[11px] font-semibold text-[#1E2B27] hover:bg-[#D5D9D7]"
                            >
                              No
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmRevokeId(inv.id)}
                            aria-label={`Revocar invitación para ${inv.email}`}
                            className="inline-flex items-center gap-1 rounded-lg border border-[#E6E9E7] px-2 py-1 text-[11px] font-semibold text-[#B4232C] hover:bg-[#FCE1E4]/50 focus-visible:outline-2 focus-visible:outline-[#B4232C]"
                          >
                            <TrashIcon className="size-3" />
                            <span>Revocar</span>
                          </button>
                        )
                      ) : (
                        <span className="text-zinc-400">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
