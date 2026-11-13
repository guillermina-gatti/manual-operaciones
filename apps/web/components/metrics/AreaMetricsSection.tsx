'use client';

// "Detalle por área": one flat white card per area with executions, and inside it one row per
// procedure that opens to its steps. The procedure with most executions opens first; each row
// opens on its own, and the leaf of the area opens (or closes) all of them at once, and says so in
// a tooltip. A procedure with two areas shows up in both cards; the general numbers never come
// from adding these cards up.
import { useId, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { TABLE_HEAD } from '@/components/executions/activity-design';
import type { ProcedureMetricsResponse } from '@/lib/api';
import type { Area } from '@/lib/directory';
import { groupByArea } from '@/lib/metrics/by-area';
import type { AreaGroup } from '@/lib/metrics/by-area';
import { formatCount } from '@/lib/metrics/format';
import { LeafIcon } from './icons';
import { AREA_CARD } from './metrics-design';
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
  const count = procedures.length;
  const panelId = (procedureId: string) => `${baseId}-${procedureId}`;
  const allOpen = procedures.every((procedure) => open.has(procedure.procedureId));

  // Each row opens and closes on its own: several can be open at once.
  function toggleProcedure(procedureId: string) {
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(procedureId)) next.delete(procedureId);
      else next.add(procedureId);
      return next;
    });
  }

  function toggleAll() {
    setOpen(allOpen ? new Set() : new Set(procedures.map((procedure) => procedure.procedureId)));
  }

  return (
    <section aria-labelledby={headingId} className={`${AREA_CARD} flex flex-col`}>
      <header className="flex items-start justify-between gap-4 bg-blanco px-6 py-[22px]">
        <div className="flex min-w-0 flex-col gap-1">
          <h3 id={headingId} className="text-2xl font-bold break-words text-bosque">
            {group.name}
          </h3>
          <p className="text-sm text-texto-suave">
            {count === 1 ? '1 procedimiento' : `${count} procedimientos`} ·{' '}
            {formatCount(group.counts.started)}{' '}
            {group.counts.started === 1 ? 'ejecución' : 'ejecuciones'}
          </p>
        </div>
        <LeafToggle
          expanded={allOpen}
          controls={procedures.map((procedure) => panelId(procedure.procedureId))}
          onToggle={toggleAll}
        />
      </header>

      <p
        className={`${TABLE_HEAD} px-6 py-2.5 text-xs font-bold tracking-[0.04em] uppercase`}
      >
        Procedimientos · tocá uno para abrirlo
      </p>
      <div className="flex flex-col">
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

// The leaf: opens or closes every procedure of the area (expanded = all of them open). Its name is
// the text of its tooltip, which shows on hover (only where the pointer hovers) and on keyboard
// focus, below the button and aligned to its right, so the card never cuts it; Escape hides it. On
// a phone, without hover, the name is enough.
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
  const label = expanded
    ? 'Ocultar el resumen de todos los procedimientos de esta área'
    : 'Ver resumen de todos los procedimientos de esta área';

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
        className={`flex size-[46px] items-center justify-center rounded-full border-[1.5px] border-bosque text-bosque transition-colors hover:bg-salvia focus-visible:outline-naranja motion-reduce:transition-none ${
          expanded ? 'bg-salvia' : 'bg-transparent'
        }`}
      >
        <LeafIcon />
      </button>
      <span
        role="tooltip"
        id={tipId}
        className={`pointer-events-none absolute top-full right-0 z-20 mt-2 w-max max-w-[260px] rounded-[10px] bg-bosque px-3 py-2 text-[13px] font-semibold text-blanco shadow-md ${
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
