'use client';

// "Para retomar": every execution of the employee still in progress, whatever the filters (neither
// the period nor the area apply: Mi actividad asks for them without the area), the most recently
// moved first. Each one says at which step it is, how long ago it last
// moved and, if it has been more than 24 h without progress, says so with its text, not only a
// color. Two views, as the picker of /ejecuciones (the same switch, the same ?vista=): cards with
// the same structure, or a list with fixed columns.
// /ejecuciones links to it with #para-retomar: the list arrives after the page, so the browser
// cannot jump there by itself; it does once the section is drawn.
import Link from 'next/link';
import { useEffect, useId, useRef } from 'react';
import { AreaChips, CARD, StatusDot } from '@/components/documents/design';
import { ScreenState } from '@/components/ui/ScreenState';
import type { DocumentReference, MyResumeItem } from '@/lib/api';
import { RESUME_SECTION_ID, formatLastActivity, staleLabel } from '@/lib/executions/my-activity';
import { stepsLabel, timeSince } from '@/lib/executions/picker';
import type { ExecutionsView } from '@/lib/executions/view';
import { metricsProcedureName } from '@/lib/metrics/procedure-name';
import { ExecutionsViewSwitch } from './ExecutionsViewSwitch';
import {
  CARD_ACTION,
  CARD_GRID,
  CARD_META,
  ITEM_CARD,
  LIST_PANEL,
  LIST_ROW,
  ListHeader,
  ROW_ACTION,
  ROW_DATA,
  ROW_NAME,
} from './collection-design';

interface ResumeListProps {
  items: MyResumeItem[];
  staleAfterHours: number;
  view?: ExecutionsView;
  // The areas of each procedure, when known (from the procedures of the period and the directory).
  areasByProcedure?: ReadonlyMap<string, DocumentReference[]>;
  // While they arrive, the section is already there with its skeleton; if they cannot be read, it
  // says so (with "Reintentar" when it makes sense).
  loading?: boolean;
  error?: { message: string; onRetry?: () => void };
}

export function ResumeList({
  items,
  staleAfterHours,
  view = 'tarjetas',
  areasByProcedure = new Map(),
  loading = false,
  error,
}: ResumeListProps) {
  const headingId = useId();
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (window.location.hash === `#${RESUME_SECTION_ID}`) {
      sectionRef.current?.scrollIntoView?.({ block: 'start' });
    }
  }, []);

  const itemProps = (item: MyResumeItem): ResumeItemProps => ({
    item,
    staleAfterHours,
    areas: areasByProcedure.get(item.procedureId) ?? [],
  });

  return (
    <section
      ref={sectionRef}
      id={RESUME_SECTION_ID}
      aria-labelledby={headingId}
      className="flex scroll-mt-6 flex-col gap-4"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 id={headingId} className="text-2xl font-bold text-texto">
            Para retomar
          </h2>
          <p className="text-texto-suave">
            Todas tus ejecuciones en curso, sin importar el período.
          </p>
        </div>
        {!loading && !error && items.length > 0 && <ExecutionsViewSwitch view={view} />}
      </div>

      {loading ? (
        <ScreenState kind="loading" label="Cargando tus ejecuciones en curso…">
          <ResumeSkeleton />
        </ScreenState>
      ) : error ? (
        <div className={`${CARD} px-6 sm:px-8`}>
          <ScreenState kind="error" message={error.message} onRetry={error.onRetry} />
        </div>
      ) : items.length === 0 ? (
        <p className={`${CARD} px-6 py-10 text-center text-texto-suave`}>
          No tenés ejecuciones sin terminar.
        </p>
      ) : view === 'lista' ? (
        <div className={LIST_PANEL}>
          <ListHeader columns={['Procedimiento', 'Área y pasos', 'Estado']} />
          <ul className="divide-y divide-borde">
            {items.map((item) => (
              <ResumeRow key={item.executionId} {...itemProps(item)} />
            ))}
          </ul>
        </div>
      ) : (
        <ul className={CARD_GRID}>
          {items.map((item) => (
            <ResumeCard key={item.executionId} {...itemProps(item)} />
          ))}
        </ul>
      )}
    </section>
  );
}

// Two cards, the shape of what arrives.
function ResumeSkeleton() {
  return (
    <div aria-hidden="true" className={CARD_GRID}>
      {[1, 2].map((n) => (
        <div key={n} className="h-48 animate-pulse rounded-2xl bg-borde motion-reduce:animate-none" />
      ))}
    </div>
  );
}

interface ResumeItemProps {
  item: MyResumeItem;
  staleAfterHours: number;
  areas: DocumentReference[];
}

// The areas, if known ("Áreas:" only for screen readers), and "N pasos".
function AreasAndSteps({ item, areas }: Pick<ResumeItemProps, 'item' | 'areas'>) {
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
      {areas.length > 0 && (
        <span>
          <span className="sr-only">Áreas: </span>
          <AreaChips areas={areas} />
        </span>
      )}
      <span className="text-sm text-texto-suave tabular-nums">{stepsLabel(item.totalSteps)}</span>
    </span>
  );
}

function State({ item, staleAfterHours }: Pick<ResumeItemProps, 'item' | 'staleAfterHours'>) {
  return item.stale ? (
    <StatusDot tone="durazno">{staleLabel(staleAfterHours)}</StatusDot>
  ) : (
    <StatusDot tone="azul">En curso</StatusDot>
  );
}

// "Último avance: hace 20 min", with the date and time in the tooltip.
function LastMove({ item }: { item: MyResumeItem }) {
  return (
    <span className="text-sm text-texto-suave">
      Último avance:{' '}
      <time
        dateTime={item.lastActivityAt}
        title={formatLastActivity(item.lastActivityAt)}
        className="text-texto tabular-nums"
      >
        hace {timeSince(item.lastActivityAt)}
      </time>
    </span>
  );
}

function CurrentStep({ item, className }: { item: MyResumeItem; className: string }) {
  return (
    <p className={className}>
      <span className="text-texto-suave">
        Paso {item.currentStep.order} de {item.totalSteps}:
      </span>{' '}
      <span className="font-semibold text-texto">{item.currentStep.title}</span>
    </p>
  );
}

function ContinueLink({ item, nameId, className }: { item: MyResumeItem; nameId: string; className: string }) {
  return (
    <Link href={`/ejecuciones/${item.executionId}`} aria-describedby={nameId} className={className}>
      Continuar<span aria-hidden="true"> →</span>
    </Link>
  );
}

function ResumeCard({ item, staleAfterHours, areas }: ResumeItemProps) {
  const nameId = useId();
  return (
    <li className={ITEM_CARD}>
      <div className={CARD_META}>
        <AreasAndSteps item={item} areas={areas} />
        <State item={item} staleAfterHours={staleAfterHours} />
      </div>
      <h3 id={nameId} className="break-words text-xl font-bold text-texto">
        {metricsProcedureName(item.procedureId, item.procedureTitle)}
      </h3>
      <div className="flex flex-col gap-1">
        <CurrentStep item={item} className="line-clamp-2 break-words" />
        <LastMove item={item} />
      </div>
      <ContinueLink item={item} nameId={nameId} className={CARD_ACTION} />
    </li>
  );
}

function ResumeRow({ item, staleAfterHours, areas }: ResumeItemProps) {
  const nameId = useId();
  return (
    <li className={LIST_ROW}>
      <div className={ROW_NAME}>
        <h3 id={nameId} className="break-words font-bold text-texto">
          {metricsProcedureName(item.procedureId, item.procedureTitle)}
        </h3>
        <CurrentStep item={item} className="truncate text-sm" />
      </div>
      <div className={ROW_DATA}>
        <AreasAndSteps item={item} areas={areas} />
      </div>
      <div className="flex min-w-0 flex-col items-start gap-0.5">
        <State item={item} staleAfterHours={staleAfterHours} />
        <LastMove item={item} />
      </div>
      <ContinueLink item={item} nameId={nameId} className={ROW_ACTION} />
    </li>
  );
}
