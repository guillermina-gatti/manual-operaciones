'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { AREAS_CHANGED_EVENT, listApiAreas } from '@/lib/api';
import type { AreaItem } from '@/lib/api';
import { CreateAreaModal } from './CreateAreaModal';
import { EditAreaModal } from './EditAreaModal';

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

function PlusIcon({ className = 'size-4' }: { className?: string }) {
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
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
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

export function AreasManagementView() {
  const [areas, setAreas] = useState<AreaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingArea, setEditingArea] = useState<AreaItem | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadAreas() {
      try {
        const data = await listApiAreas();
        if (!cancelled) {
          setAreas(data);
        }
      } catch {
        // Ignorar o mantener estado previo si falla la conexión
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadAreas();

    function handleAreasChanged() {
      void loadAreas();
    }

    window.addEventListener(AREAS_CHANGED_EVENT, handleAreasChanged);
    return () => {
      cancelled = true;
      window.removeEventListener(AREAS_CHANGED_EVENT, handleAreasChanged);
    };
  }, []);

  const filteredAreas = useMemo(() => {
    return areas.filter((area) => {
      const matchesSearch = area.name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus =
        filterStatus === 'ALL'
          ? true
          : filterStatus === 'ACTIVE'
          ? area.isActive
          : !area.isActive;
      return matchesSearch && matchesStatus;
    });
  }, [areas, searchTerm, filterStatus]);

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
          <span className="font-semibold text-[#0B4233]">Áreas</span>
        </nav>

        {/* Encabezado */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-[#0B4233] sm:text-3xl">
              Áreas de la organización
            </h1>
            <p className="mt-1 text-sm text-[#646F6A]">
              Administrá los departamentos y áreas funcionales para documentos, procedimientos y usuarios.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setIsCreateModalOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-[#0B4233] px-4 py-2.5 text-sm font-semibold text-white shadow-xs transition-colors hover:bg-[#135040] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E85114]"
          >
            <PlusIcon className="size-4" />
            <span>Crear nueva área</span>
          </button>
        </div>

        {/* Barra de control y filtros */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between rounded-2xl border border-[#E6E9E7] bg-white p-4 shadow-xs">
          <div className="relative flex-1 max-w-md">
            <SearchIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-[#646F6A]" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar área por nombre…"
              aria-label="Buscar áreas"
              className="w-full rounded-xl border border-[#E6E9E7] bg-[#F6F7F6] py-2 pl-10 pr-4 text-sm text-[#1E2B27] placeholder-[#646F6A] focus:border-[#0B4233] focus:bg-white focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-1.5" role="group" aria-label="Filtrar por estado">
            <button
              type="button"
              onClick={() => setFilterStatus('ALL')}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                filterStatus === 'ALL'
                  ? 'bg-[#0B4233] text-white'
                  : 'bg-[#F6F7F6] text-[#646F6A] hover:bg-[#E6E9E7]'
              }`}
            >
              Todas ({areas.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterStatus('ACTIVE')}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                filterStatus === 'ACTIVE'
                  ? 'bg-[#0B4233] text-white'
                  : 'bg-[#F6F7F6] text-[#646F6A] hover:bg-[#E6E9E7]'
              }`}
            >
              Activas ({areas.filter((a) => a.isActive).length})
            </button>
            <button
              type="button"
              onClick={() => setFilterStatus('INACTIVE')}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                filterStatus === 'INACTIVE'
                  ? 'bg-[#0B4233] text-white'
                  : 'bg-[#F6F7F6] text-[#646F6A] hover:bg-[#E6E9E7]'
              }`}
            >
              Inactivas ({areas.filter((a) => !a.isActive).length})
            </button>
          </div>
        </div>

        {/* Contenido / Listado */}
        {loading ? (
          <div className="rounded-2xl border border-[#E6E9E7] bg-white p-12 text-center text-sm text-[#646F6A]">
            Cargando catálogo de áreas…
          </div>
        ) : filteredAreas.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#E6E9E7] bg-white p-12 text-center">
            <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-[#F6F7F6] text-[#646F6A]">
              <BuildingIcon className="size-6" />
            </div>
            <h3 className="mt-4 text-base font-bold text-[#1E2B27]">
              No se encontraron áreas
            </h3>
            <p className="mt-1 text-sm text-[#646F6A]">
              {searchTerm
                ? 'Probá ajustando los términos de búsqueda o quitando los filtros.'
                : 'No hay áreas registradas que coincidan con la vista actual.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredAreas.map((area) => (
              <div
                key={area.id}
                data-testid={`area-card-${area.id}`}
                className={`flex flex-col justify-between rounded-2xl border border-[#E6E9E7] bg-white p-5 shadow-xs transition-shadow hover:shadow-md ${
                  !area.isActive ? 'opacity-85 bg-neutral-50/50' : ''
                }`}
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#EAF2EF] text-[#0B4233]">
                        <BuildingIcon className="size-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <h2 className="truncate text-base font-bold text-[#1E2B27]" title={area.name}>
                          {area.name}
                        </h2>
                        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-[#646F6A]">
                          <span
                            className={`flex size-2 rounded-full ${
                              area.isActive ? 'bg-emerald-500' : 'bg-rose-500'
                            }`}
                          />
                          <span>{area.isActive ? 'Activa' : 'Inactiva'}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-end border-t border-[#E6E9E7]/60 pt-3">
                  <button
                    type="button"
                    data-testid={`edit-area-${area.id}`}
                    onClick={() => {
                      setEditingArea(area);
                      setIsEditModalOpen(true);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[#E6E9E7] bg-white px-2.5 py-1 text-xs font-semibold text-[#646F6A] shadow-2xs transition-colors hover:bg-[#F6F7F6] hover:text-[#0B4233]"
                  >
                    <EditIcon className="size-3.5" />
                    <span>Editar</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <CreateAreaModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={(created) => {
          setAreas((prev) => [...prev, created]);
        }}
      />

      <EditAreaModal
        area={editingArea}
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false);
          setEditingArea(null);
        }}
        onSuccess={(updated) => {
          setAreas((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
        }}
      />
    </main>
  );
}
