'use client';

// "Detalle por área": one card per area with executions, and inside it each procedure step by
// step. A procedure with two areas shows up in both cards; the general numbers never come from
// adding these cards up. The area summary opens with the leaf button.
import { useId, useState } from 'react';
import { CARD } from '@/components/documents/design';
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

function AreaCard({ group }: { group: AreaGroup }) {
  const headingId = useId();
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const count = group.procedures.length;

  return (
    <section aria-labelledby={headingId} className={`${CARD} flex flex-col gap-6 p-6 sm:p-8`}>
      <header className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <h3 id={headingId} className="break-words text-[22px] font-bold text-bosque">
            {group.name}
          </h3>
          <p className="text-sm text-texto-suave">
            {count === 1 ? '1 procedimiento' : `${count} procedimientos`} ·{' '}
            {formatCount(group.counts.started)}{' '}
            {group.counts.started === 1 ? 'ejecución' : 'ejecuciones'}
          </p>
        </div>
        <button
          type="button"
          title="Resumen del área"
          aria-label={`${open ? 'Ocultar' : 'Ver'} resumen de ${group.name}`}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((current) => !current)}
          className={`group flex size-12 shrink-0 items-center justify-center rounded-full border transition-colors ${
            open
              ? 'border-bosque bg-bosque text-blanco'
              : 'border-borde bg-blanco text-bosque hover:bg-salvia'
          }`}
        >
          <LeafIcon className="transition-transform group-hover:-rotate-12 motion-reduce:transition-none" />
        </button>
      </header>

      {open && <AreaSummary id={panelId} group={group} />}

      <div className="flex flex-col gap-8">
        {group.procedures.map((procedure) => (
          <ProcedureMetricsCard key={procedure.procedureId} procedure={procedure} />
        ))}
      </div>
    </section>
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
