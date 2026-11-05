'use client';

// Area and period of the panel. Applying only changes the address; the panel reads it from
// there. Whoever uses it mounts it with key={href}, so going back or forward shows the
// filters of the address.
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import type { FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { METRICS_PATH, metricsHref } from '@/lib/metrics/filters';
import type { AreaOption, PanelFilters } from '@/lib/metrics/filters';

interface MetricsFiltersFormProps {
  filters: PanelFilters;
  areas: AreaOption[];
}

const FIELD =
  'min-h-11 w-full rounded-lg border border-zinc-300 bg-white px-3 text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-600 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:[color-scheme:dark]';
const LABEL = 'text-sm font-medium text-zinc-700 dark:text-zinc-300';

export const FILTER_MESSAGES = {
  missingDates: 'Elegí las dos fechas.',
  fromAfterTo: 'La fecha "Desde" no puede ser posterior a "Hasta".',
} as const;

export function MetricsFiltersForm({ filters, areas }: MetricsFiltersFormProps) {
  const router = useRouter();
  const id = useId();
  const [areaId, setAreaId] = useState(filters.areaId ?? '');
  const [from, setFrom] = useState(filters.from);
  const [to, setTo] = useState(filters.to);
  const [error, setError] = useState<string | null>(null);
  const errorId = `${id}-error`;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!from || !to) return setError(FILTER_MESSAGES.missingDates);
    // "YYYY-MM-DD" sorts like the dates it represents.
    if (from > to) return setError(FILTER_MESSAGES.fromAfterTo);
    router.push(metricsHref({ areaId: areaId || null, from, to }));
  }

  const invalid = error ? true : undefined;
  const describedBy = error ? errorId : undefined;

  return (
    <form
      aria-label="Filtros"
      onSubmit={submit}
      noValidate
      className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_auto_auto] lg:items-end">
        <div className="flex flex-col gap-1.5 sm:col-span-2 lg:col-span-1">
          <label htmlFor={`${id}-area`} className={LABEL}>
            Área
          </label>
          <select
            id={`${id}-area`}
            value={areaId}
            onChange={(event) => setAreaId(event.target.value)}
            className={FIELD}
          >
            {areas.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-from`} className={LABEL}>
            Desde
          </label>
          <input
            id={`${id}-from`}
            type="date"
            value={from}
            max={to || undefined}
            onChange={(event) => {
              setFrom(event.target.value);
              setError(null);
            }}
            aria-invalid={invalid}
            aria-describedby={describedBy}
            className={FIELD}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-to`} className={LABEL}>
            Hasta
          </label>
          <input
            id={`${id}-to`}
            type="date"
            value={to}
            min={from || undefined}
            onChange={(event) => {
              setTo(event.target.value);
              setError(null);
            }}
            aria-invalid={invalid}
            aria-describedby={describedBy}
            className={FIELD}
          />
        </div>
        <Button type="submit" className="min-h-12! rounded-lg! px-6! text-base shadow-sm">
          Aplicar
        </Button>
        <Button
          variant="secondary"
          className="min-h-12! rounded-lg! px-5! text-base"
          onClick={() => router.push(METRICS_PATH)}
        >
          Últimos 30 días
        </Button>
      </div>
      {error && (
        <p id={errorId} role="alert" className="text-sm font-medium text-red-700 dark:text-red-400">
          {error}
        </p>
      )}
    </form>
  );
}
