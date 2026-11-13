'use client';

// "Detalle por área": one card per area with executions, and inside it one row per procedure that
// opens to its steps. The procedure with most executions opens first; opening another closes it,
// so one is open at a time. The leaf of the area opens (or closes) all of them at once, with the
// area summary, and says so in a tooltip. A procedure with two areas shows up in both cards; the
// general numbers never come from adding these cards up.
import { useId, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { TABLE_FRAME } from '@/components/executions/activity-design';
import type { ProcedureMetricsResponse } from '@/lib/api';
import type { Area } from '@/lib/directory';
import { groupByArea } from '@/lib/metrics/by-area';
import type { AreaGroup } from '@/lib/metrics/by-area';
import { formatDuration } from '@/lib/executions/format';
import { formatCount, formatPercent } from '@/lib/metrics/format';
import { outcomeShares } from '@/lib/metrics/summary';
import { FeatherBar } from './FeatherBar';
import { FeatherIcon, LeafIcon, TimerIcon } from './icons';
import styles from './metrics.module.css';
import { AREA_HEAD } from './metrics-design';
import { ProcedureMetricsCard } from './ProcedureMetricsCard';
import { SectionHeading } from './SectionHeading';

interface AreaMetricsSectionProps {
  procedures: ProcedureMetricsResponse[];
  areas: Area[];
  areaId: string | null;
  // The areas the viewer may see; null means any (ADMIN).
  viewerAreaIds: string[] | null;
}

export function AreaMetricsSection({
  procedures,
  areas,
  areaId,
  viewerAreaIds,
}: AreaMetricsSectionProps) {
  const headingId = useId();
  const { groups, withoutExecutions } = groupByArea(procedures, areas, { areaId, viewerAreaIds });

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <SectionHeading id={headingId}>Detalle por área</SectionHeading>
        <p className="text-texto-suave">
          Dónde se traban: paso a paso de cada procedimiento, cuántas ejecuciones pasaron por cada
          paso y cuánto tardaron.
        </p>
      </div>

      {groups.map((group) => (
        <AreaCard key={group.areaId} group={group} />
      ))}

      {withoutExecutions > 0 && (
        <p className="text-texto-suave">
          {withoutExecutions === 1
            ? '1 área no tiene ejecuciones en este período y no se muestra.'
            : `${withoutExecutions} áreas no tienen ejecuciones en este período y no se muestran.`}
        </p>
      )}

      <p className="text-[13px] text-texto-suave">
        Llegaron = ejecuciones que empezaron ese paso. Las que llegaron y no terminaron ni
        abandonaron siguen en curso en ese paso.
      </p>
    </section>
  );
}

// The procedure with most executions first; on a tie, in the order of the API.
function byExecutions(procedures: ProcedureMetricsResponse[]): ProcedureMetricsResponse[] {
  return procedures
    .map((procedure, index) => ({ procedure, index }))
    .sort((a, b) => b.procedure.started - a.procedure.started || a.index - b.index)
    .map(({ procedure }) => procedure);
}

function AreaCard({ group }: { group: AreaGroup }) {
  const headingId = useId();
  const baseId = useId();
  const procedures = byExecutions(group.procedures);
  const [open, setOpen] = useState<ReadonlySet<string>>(
    () => new Set(procedures.slice(0, 1).map((procedure) => procedure.procedureId)),
  );
  // The leaf is on while it keeps everything open, with the area summary. Opening or closing one
  // procedure turns it off.
  const [summary, setSummary] = useState(false);
  const count = procedures.length;
  const panelId = (procedureId: string) => `${baseId}-${procedureId}`;
  const summaryId = `${baseId}-summary`;

  function toggleProcedure(procedureId: string) {
    setSummary(false);
    setOpen((current) => (current.has(procedureId) ? withoutId(current, procedureId) : new Set([procedureId])));
  }

  function toggleAll() {
    if (summary) {
      setOpen(new Set());
      setSummary(false);
    } else {
      setOpen(new Set(procedures.map((procedure) => procedure.procedureId)));
      setSummary(true);
    }
  }

  return (
    <section aria-labelledby={headingId} className={`${TABLE_FRAME} flex flex-col`}>
      <header
        className={`${AREA_HEAD} flex items-start justify-between gap-4 rounded-t-[19px] px-5 pt-5 pb-4 sm:px-6`}
      >
        <div className="flex min-w-0 flex-col gap-1">
          <h3 id={headingId} className="text-2xl font-bold break-words text-bosque">
            {group.name}
          </h3>
          <p className="text-sm text-texto">
            {count === 1 ? '1 procedimiento' : `${count} procedimientos`} ·{' '}
            {formatCount(group.counts.started)}{' '}
            {group.counts.started === 1 ? 'ejecución' : 'ejecuciones'}
          </p>
        </div>
        <LeafToggle
          expanded={summary}
          controls={[...procedures.map((p) => panelId(p.procedureId)), ...(summary ? [summaryId] : [])]}
          onToggle={toggleAll}
        />
      </header>

      {summary && (
        <div className="px-5 pb-4 sm:px-6">
          <AreaSummary id={summaryId} group={group} />
        </div>
      )}

      <p className="px-5 pt-2 pb-2 text-xs font-bold tracking-wider text-texto-suave uppercase sm:px-6">
        Procedimientos (tocá uno para abrirlo)
      </p>
      <div className="flex flex-col overflow-hidden rounded-b-[19px]">
        {procedures.map((procedure) => (
          <ProcedureMetricsCard
            key={procedure.procedureId}
            procedure={procedure}
            open={open.has(procedure.procedureId)}
            onToggle={() => toggleProcedure(procedure.procedureId)}
            panelId={panelId(procedure.procedureId)}
          />
        ))}
      </div>
    </section>
  );
}

function withoutId(set: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(set);
  next.delete(id);
  return next;
}

// The leaf: opens or closes every procedure of the area. Its name is the text of its tooltip,
// which shows on hover (only where there is a pointer that hovers) and on keyboard focus, and
// Escape hides it. On a phone, without hover, the name is enough.
function LeafToggle({
  expanded,
  controls,
  onToggle,
}: {
  expanded: boolean;
  controls: string[];
  onToggle: () => void;
}) {
  const tipId = useId();
  const [dismissed, setDismissed] = useState(false);
  const label = `${expanded ? 'Ocultar' : 'Ver'} resumen de todos los procedimientos de esta área`;

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'Escape') setDismissed(true);
  }

  return (
    <span className="group relative shrink-0" onMouseLeave={() => setDismissed(false)}>
      <button
        type="button"
        aria-label={label}
        aria-describedby={tipId}
        aria-expanded={expanded}
        aria-controls={controls.join(' ')}
        onClick={onToggle}
        onKeyDown={onKeyDown}
        onBlur={() => setDismissed(false)}
        className={`flex size-12 items-center justify-center rounded-full border transition-colors focus-visible:outline-naranja motion-reduce:transition-none ${
          expanded
            ? 'border-bosque bg-bosque text-blanco'
            : 'border-borde bg-blanco text-bosque hover:bg-salvia'
        }`}
      >
        <LeafIcon className="transition-transform group-hover:-rotate-12 motion-reduce:transition-none" />
      </button>
      <span
        role="tooltip"
        id={tipId}
        className={`pointer-events-none absolute top-full right-0 z-20 mt-2 w-max max-w-[15rem] rounded-lg bg-texto px-3 py-2 text-sm font-semibold text-blanco shadow-md ${
          dismissed
            ? 'hidden'
            : 'invisible group-hover:visible group-has-[:focus-visible]:visible'
        }`}
      >
        {label}
      </span>
    </span>
  );
}

function AreaSummary({ id, group }: { id: string; group: AreaGroup }) {
  const { counts } = group;
  const shares = outcomeShares(counts);
  return (
    <div
      id={id}
      className={`${styles.palette} flex flex-col gap-3 rounded-xl bg-fondo p-4 transition-opacity duration-200 motion-reduce:transition-none starting:opacity-0`}
    >
      <ul className="flex flex-wrap gap-x-6 gap-y-2">
        <li className="flex items-center gap-2">
          <FeatherIcon className={`size-4 ${styles.legendCompletadas}`} />
          Completadas <strong>{formatCount(counts.completed)}</strong>
          <span className="text-texto-suave">{formatPercent(shares.completed)}</span>
        </li>
        <li className="flex items-center gap-2">
          <FeatherIcon className={`size-4 ${styles.legendCurso}`} />
          En curso <strong>{formatCount(counts.inProgress)}</strong>
        </li>
        <li className="flex items-center gap-2">
          <FeatherIcon className={`size-4 ${styles.legendAbandonadas}`} />
          Abandonadas <strong>{formatCount(counts.abandoned)}</strong>
          <span className="text-texto-suave">{formatPercent(shares.abandoned)}</span>
        </li>
        <li className="flex items-center gap-2">
          <TimerIcon className="size-4 text-naranja" />
          Tiempo medio <strong>{formatDuration(group.avgCompletionMs)}</strong>
        </li>
      </ul>
      <FeatherBar counts={counts} size="sm" className="max-w-[640px]" />
    </div>
  );
}
