'use client';

// Area and period of the panel. Choosing an area or a quick period applies at once; "Aplicar"
// is for dates edited by hand. Every way, as "Limpiar filtros", only changes the address; the panel reads it from there. Whoever uses it mounts it with key={href}, so going
// back or forward shows the filters of the address.
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import type { FormEvent } from 'react';
import {
  BUTTON_PRIMARY,
  CARD,
  ERROR_TEXT,
  INPUT,
  LABEL,
  TEXT_LINK,
} from '@/components/documents/design';
import {
  METRICS_PATH,
  QUICK_PERIODS,
  matchingQuickPeriod,
  metricsHref,
  quickPeriodRange,
} from '@/lib/metrics/filters';
import type { AreaOption, PanelFilters, QuickPeriod } from '@/lib/metrics/filters';
import { formatPeriod } from '@/lib/metrics/format';
import { AreaSelect } from './AreaSelect';
import { FilterIcon, WarningIcon } from './icons';

interface MetricsFiltersFormProps {
  filters: PanelFilters;
  areas: AreaOption[];
  // "YYYY-MM-DD" in the company: the quick periods end today.
  today: string;
  // The page the filters go to; /metricas unless another page reuses them.
  path?: string;
  // What the page adds to each address the filters go to (Mi actividad keeps its ?vista=). By
  // default nothing: /metricas has no other parameters.
  keepParams?: (href: string) => string;
}

export const FILTER_MESSAGES = {
  missingDates: 'Elegí las dos fechas.',
  fromAfterTo: 'La fecha "Desde" no puede ser posterior a "Hasta".',
} as const;

export function MetricsFiltersForm({
  filters,
  areas,
  today,
  path = METRICS_PATH,
  keepParams = (href) => href,
}: MetricsFiltersFormProps) {
  const router = useRouter();
  const id = useId();
  const [areaId, setAreaId] = useState(filters.areaId ?? '');
  const [from, setFrom] = useState(filters.from);
  const [to, setTo] = useState(filters.to);
  const [error, setError] = useState<string | null>(null);
  const errorId = `${id}-error`;
  const quickLabelId = `${id}-quick`;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!from || !to) return setError(FILTER_MESSAGES.missingDates);
    // "YYYY-MM-DD" sorts like the dates it represents.
    if (from > to) return setError(FILTER_MESSAGES.fromAfterTo);
    router.push(keepParams(metricsHref({ areaId: areaId || null, from, to }, path)));
  }

  // An area applies at once, with the dates loaded in the form. If they are not valid (an
  // empty one, or "Desde" after "Hasta"), the applied ones are kept: the area never waits for
  // dates that still have to be fixed.
  function applyArea(value: string) {
    setAreaId(value);
    const datesOk = Boolean(from && to && from <= to);
    router.push(
      keepParams(
        metricsHref(
          {
            areaId: value || null,
            from: datesOk ? from : filters.from,
            to: datesOk ? to : filters.to,
          },
          path,
        ),
      ),
    );
  }

  // A quick period applies at once, with the area chosen in the selector.
  function applyQuickPeriod(period: QuickPeriod) {
    router.push(
      keepParams(metricsHref({ areaId: areaId || null, ...quickPeriodRange(period, today) }, path)),
    );
  }

  // Changing a date by hand leaves no quick period marked.
  const activeQuick = matchingQuickPeriod(from, to, today);
  const invalid = error ? true : undefined;
  const describedBy = error ? errorId : undefined;
  // What is being shown: the applied filters, not the ones being edited.
  const shownArea =
    areas.find((option) => option.value === (filters.areaId ?? ''))?.label ?? 'el área elegida';

  return (
    <form
      aria-label="Filtros"
      onSubmit={submit}
      noValidate
      className={`${CARD} flex flex-col gap-5 p-6 sm:p-8`}
    >
      <h2 className="flex items-center gap-2 text-xl font-bold text-texto">
        <FilterIcon className="text-naranja" />
        Filtros
      </h2>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_auto_auto] lg:items-end">
        <div className="sm:col-span-2 lg:col-span-1">
          <AreaSelect options={areas} value={areaId} onChange={applyArea} />
        </div>
        <div className="flex flex-col gap-2">
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
            className={INPUT}
          />
        </div>
        <div className="flex flex-col gap-2">
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
            className={INPUT}
          />
        </div>
        <div className="flex flex-col gap-2 sm:col-span-2 lg:col-span-1">
          <span id={quickLabelId} className={LABEL}>
            Período rápido
          </span>
          <div
            role="group"
            aria-labelledby={quickLabelId}
            className="flex min-h-12 overflow-hidden rounded-xl border border-borde bg-blanco"
          >
            {QUICK_PERIODS.map((period) => {
              const active = period.id === activeQuick;
              return (
                <button
                  key={period.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => applyQuickPeriod(period.id)}
                  className={`min-h-12 flex-1 whitespace-nowrap px-4 text-sm transition-colors not-first:border-l not-first:border-borde ${
                    active
                      ? 'bg-bosque font-bold text-blanco'
                      : 'font-semibold text-texto hover:bg-salvia'
                  }`}
                >
                  {period.label}
                </button>
              );
            })}
          </div>
        </div>
        <button type="submit" className={BUTTON_PRIMARY}>
          Aplicar
        </button>
      </div>

      {error && (
        <p id={errorId} role="alert" className={`flex items-center gap-2 font-medium ${ERROR_TEXT}`}>
          <WarningIcon className="size-4" />
          {error}
        </p>
      )}

      <div className="flex flex-col gap-2 border-t border-borde pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p aria-live="polite" className="text-texto-suave">
          Mostrando <strong className="font-semibold text-texto">{shownArea}</strong> ·{' '}
          {formatPeriod(filters.from, filters.to)}
        </p>
        <button
          type="button"
          onClick={() => router.push(keepParams(path))}
          className={`${TEXT_LINK} min-h-11 self-start underline sm:self-auto`}
        >
          Limpiar filtros
        </button>
      </div>
    </form>
  );
}
