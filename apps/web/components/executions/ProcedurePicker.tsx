'use client';

// Choosing a procedure to execute (HU12). The procedures come from GET /api/procedures (HU11),
// which only gives the ones of the user's areas; only a published version with steps can be
// executed. The same button starts a new execution or resumes the one in progress: the API
// decides (201 or 200) and either way the screen opens it.
//
// Above, "Para retomar": the execution in progress that moved last, from "resume" of GET
// /api/metrics/me. That call is extra: if it fails, the picker works the same, without the strip
// and without the "En curso" marks. Searching and ordering happen in the browser.
//
// Two views, as /documentos: Tarjetas (by default) or Lista, in the address (?vista=lista). The
// search and the order are kept when switching, and every state looks the same in both.
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  AreaChips,
  CARD,
  ERROR_BOX,
  INPUT,
  SearchIcon,
  TEXT_LINK,
} from '@/components/documents/design';
import { LIST_BUTTON_PRIMARY, LIST_BUTTON_SECONDARY } from '@/components/documents/list-design';
import { ScreenState } from '@/components/ui/ScreenState';
import type { MyResumeItem } from '@/lib/api';
import { describeExecutionError, getMyMetrics, startExecution, useApiResource } from '@/lib/api';
import {
  describeListError,
  executableProcedures,
} from '@/lib/executions/executable-procedures';
import type { ExecutableProcedure } from '@/lib/executions/executable-procedures';
import { RESUME_SECTION_HREF } from '@/lib/executions/my-activity';
import {
  SORT_OPTIONS,
  byLastActivity,
  inProgressByProcedure,
  isPickerSort,
  matchesProcedureSearch,
  moreInProgressLabel,
  proceduresLabel,
  sortProcedures,
  stepsLabel,
  timeSince,
} from '@/lib/executions/picker';
import type { PickerSort } from '@/lib/executions/picker';
import { VIEW_PARAM, parseExecutionsView, withExecutionsView } from '@/lib/executions/view';
import type { ExecutionsView } from '@/lib/executions/view';
import { metricsProcedureName } from '@/lib/metrics/procedure-name';
import { listProcedures } from '@/lib/procedures';
import { useSession } from '@/lib/session';
import { ExecutionsViewSwitch } from './ExecutionsViewSwitch';
import { ProgressNest } from './ProgressNest';
import {
  CARD_ACTION,
  CARD_GRID,
  CARD_META,
  ITEM_CARD,
  InProgressMark,
  LIST_PANEL,
  LIST_ROW,
  ListHeader,
  ROW_ACTION,
  ROW_DATA,
  ROW_NAME,
} from './collection-design';

// The API gives up to 100 per page; for the MVP the first page is enough.
const PAGE_LIMIT = 100;

// The soft blue border of a card in progress (over the one of CARD).
const IN_PROGRESS_BORDER = 'border-azul-borrador/40!';

interface ProcedurePickerProps {
  // Given, the list is not asked to the API (tests). Then the executions in progress are only the
  // ones given in resume.
  procedures?: readonly ExecutableProcedure[];
  resume?: readonly MyResumeItem[];
}

export function ProcedurePicker({ procedures, resume = [] }: ProcedurePickerProps) {
  const view = parseExecutionsView(useSearchParams().get(VIEW_PARAM));
  return procedures ? (
    <ProcedureCards procedures={procedures} resume={resume} view={view} />
  ) : (
    <PublishedProcedures view={view} />
  );
}

function PublishedProcedures({ view }: { view: ExecutionsView }) {
  const { user } = useSession();
  // The user is part of the key: switching users asks again.
  const list = useApiResource(user ? `executable-procedures:${user.id}` : null, (signal) =>
    listProcedures({ limit: PAGE_LIMIT }, signal),
  );
  // Without filters: "resume" has no period.
  const metrics = useApiResource(user ? `picker-resume:${user.id}` : null, (signal) =>
    getMyMetrics({}, signal),
  );

  // With cacheComponents, Next hides the page with <Activity> and shows the same instance on
  // return; the effects run again then. Coming back from an execution, its step changed: ask again.
  const shownRef = useRef(false);
  const reloadMetrics = metrics.reload;
  useEffect(() => {
    if (shownRef.current) reloadMetrics();
    shownRef.current = true;
  }, [reloadMetrics]);

  if (list.status === 'idle' || list.status === 'loading') {
    return (
      <ScreenState kind="loading" label="Cargando los procedimientos…">
        <PickerSkeleton view={view} />
      </ScreenState>
    );
  }
  if (list.status === 'error') {
    const { message, canRetry } = describeListError(list.error);
    return <ScreenState kind="error" message={message} onRetry={canRetry ? list.reload : undefined} />;
  }
  return (
    <ProcedureCards
      procedures={executableProcedures(list.data.data)}
      // Failed or still on its way: no strip and no marks, never an error.
      resume={metrics.status === 'success' ? metrics.data.resume : []}
      view={view}
    />
  );
}

interface ProcedureCardsProps {
  procedures: readonly ExecutableProcedure[];
  resume: readonly MyResumeItem[];
  view: ExecutionsView;
}

function ProcedureCards({ procedures, resume, view }: ProcedureCardsProps) {
  const router = useRouter();
  const baseId = useId();
  const [startingId, setStartingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<PickerSort>('az');
  const searchRef = useRef<HTMLInputElement>(null);
  // Stops a second click that arrives before React renders the disabled buttons.
  const startingRef = useRef(false);
  // Changes each time the screen is hidden, so a late answer from before is ignored.
  const visitRef = useRef(0);

  // With cacheComponents, Next hides this page with <Activity> when navigating away and shows the
  // same instance on return. The cleanup runs on hide: coming back starts from a clean screen.
  useLayoutEffect(
    () => () => {
      visitRef.current += 1;
      startingRef.current = false;
      setStartingId(null);
      setError(null);
    },
    [],
  );

  const inProgress = useMemo(() => inProgressByProcedure(resume), [resume]);
  const latest = useMemo(() => byLastActivity(resume)[0] ?? null, [resume]);
  const visible = useMemo(
    () =>
      sortProcedures(
        procedures.filter((procedure) => matchesProcedureSearch(procedure.title, search)),
        sort,
        inProgress,
      ),
    [procedures, search, sort, inProgress],
  );

  if (procedures.length === 0 && !latest) {
    return (
      <div className={`${CARD} flex flex-col items-center gap-2 px-6 py-12 text-center`}>
        <p className="text-lg font-semibold text-texto">
          Todavía no hay procedimientos para ejecutar.
        </p>
        <p className="text-texto-suave">Cuando publiquen un recorrido de tu área, aparece acá.</p>
      </div>
    );
  }

  async function start(procedureId: string) {
    if (startingRef.current) return;
    startingRef.current = true;
    const visit = visitRef.current;
    setStartingId(procedureId);
    setError(null);
    try {
      const execution = await startExecution(procedureId);
      // The user already left: opening the execution now would be a surprise.
      if (visitRef.current !== visit) return;
      // The buttons stay disabled until the execution screen hides this one.
      router.push(`/ejecuciones/${execution.id}`);
    } catch (failure) {
      if (visitRef.current !== visit) return;
      setError(describeExecutionError(failure, 'start').message);
      startingRef.current = false;
      setStartingId(null);
    }
  }

  function clearSearch() {
    setSearch('');
    searchRef.current?.focus();
  }

  const titleOf = (item: MyResumeItem) =>
    procedures.find((procedure) => procedure.id === item.procedureId)?.title ??
    metricsProcedureName(item.procedureId, item.procedureTitle);

  const itemProps = (procedure: ExecutableProcedure): ProcedureItemProps => ({
    procedure,
    running: inProgress.get(procedure.id),
    titleId: `${baseId}-${procedure.id}`,
    starting: startingId === procedure.id,
    disabled: startingId !== null,
    onStart: () => start(procedure.id),
  });

  return (
    <div className="flex flex-col gap-6">
      {latest && (
        <ResumeStrip
          item={latest}
          title={titleOf(latest)}
          moreCount={resume.length - 1}
          view={view}
        />
      )}

      {error && (
        <p role="alert" className={ERROR_BOX}>
          {error}
        </p>
      )}

      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-4">
          <div className="relative min-w-0 lg:flex-1">
            <label htmlFor={`${baseId}-search`} className="sr-only">
              Buscar un procedimiento
            </label>
            <SearchIcon className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-texto-suave" />
            <input
              ref={searchRef}
              id={`${baseId}-search`}
              type="search"
              placeholder="Buscar un procedimiento…"
              autoComplete="off"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className={`${INPUT} pl-12 shadow-sm transition-colors placeholder:text-texto-suave hover:border-bosque/30 focus:border-bosque motion-reduce:transition-none`}
            />
          </div>
          <div className="flex flex-wrap items-center gap-3 lg:flex-nowrap lg:gap-4">
            <div className="flex min-w-0 items-center gap-2">
              <label
                htmlFor={`${baseId}-sort`}
                className="shrink-0 text-sm font-semibold text-texto-suave"
              >
                Orden
              </label>
              <div className="relative min-w-0">
                <select
                  id={`${baseId}-sort`}
                  value={sort}
                  onChange={(event) => {
                    if (isPickerSort(event.target.value)) setSort(event.target.value);
                  }}
                  className={`${INPUT} w-auto max-w-full cursor-pointer appearance-none pr-10 font-semibold transition-colors hover:border-bosque/30 focus:border-bosque motion-reduce:transition-none`}
                >
                  {SORT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <ChevronIcon />
              </div>
            </div>
            <ExecutionsViewSwitch view={view} />
            <p
              aria-live="polite"
              className="ml-auto shrink-0 text-sm text-texto-suave tabular-nums lg:ml-0"
            >
              {proceduresLabel(visible.length)}
            </p>
          </div>
        </div>

        {procedures.length === 0 ? (
          <p className={`${CARD} px-6 py-10 text-center text-texto-suave`}>
            Cuando publiquen un recorrido de tu área, aparece acá.
          </p>
        ) : visible.length === 0 ? (
          <div className={`${CARD} flex flex-col items-center gap-4 px-6 py-10 text-center`}>
            <p className="break-words text-texto">
              No encontramos procedimientos con «{search.trim()}».
            </p>
            <button type="button" className={LIST_BUTTON_SECONDARY} onClick={clearSearch}>
              Limpiar búsqueda
            </button>
          </div>
        ) : view === 'lista' ? (
          <div className={LIST_PANEL}>
            <ListHeader columns={['Procedimiento', 'Área y pasos', 'Estado']} />
            <ul className="divide-y divide-borde">
              {visible.map((procedure) => (
                <ProcedureRow key={procedure.id} {...itemProps(procedure)} />
              ))}
            </ul>
          </div>
        ) : (
          <ul className={CARD_GRID}>
            {visible.map((procedure) => (
              <ProcedureCard key={procedure.id} {...itemProps(procedure)} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

interface ProcedureItemProps {
  procedure: ExecutableProcedure;
  running: MyResumeItem | undefined;
  titleId: string;
  starting: boolean;
  disabled: boolean;
  onStart: () => void;
}

// One chip per area ("Áreas:" only for screen readers) and "N pasos".
function AreasAndSteps({ procedure }: { procedure: ExecutableProcedure }) {
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
      <span>
        <span className="sr-only">Áreas: </span>
        <AreaChips areas={procedure.areas} />
      </span>
      <span className="text-sm text-texto-suave tabular-nums">
        {stepsLabel(procedure.stepCount)}
      </span>
    </span>
  );
}

// "Empezar", or "Continuar →" if it is in progress. Every button says the same; the description
// (the title) tells which procedure it opens.
type StartButtonProps = Omit<ProcedureItemProps, 'procedure'> & { className: string };

function StartButton({ running, titleId, starting, disabled, onStart, className }: StartButtonProps) {
  return (
    <button
      type="button"
      className={className}
      aria-describedby={titleId}
      disabled={disabled}
      onClick={onStart}
    >
      {starting ? (
        'Abriendo…'
      ) : running ? (
        <>
          Continuar<span aria-hidden="true"> →</span>
        </>
      ) : (
        'Empezar'
      )}
    </button>
  );
}

function ProcedureCard(props: ProcedureItemProps) {
  const { procedure, running, titleId } = props;
  return (
    <li className={`${ITEM_CARD} ${running ? IN_PROGRESS_BORDER : ''}`}>
      <div className={CARD_META}>
        <AreasAndSteps procedure={procedure} />
        {running && (
          <InProgressMark order={running.currentStep.order} total={running.totalSteps} />
        )}
      </div>
      <h2 id={titleId} className="break-words text-xl font-bold text-texto">
        {procedure.title}
      </h2>
      {procedure.description && (
        <p className="line-clamp-2 break-words text-texto-suave">{procedure.description}</p>
      )}
      <StartButton {...props} className={CARD_ACTION} />
    </li>
  );
}

function ProcedureRow(props: ProcedureItemProps) {
  const { procedure, running, titleId } = props;
  return (
    <li className={LIST_ROW}>
      <div className={ROW_NAME}>
        <h2 id={titleId} className="break-words font-bold text-texto">
          {procedure.title}
        </h2>
        {procedure.description && (
          <p className="truncate text-sm text-texto-suave" title={procedure.description}>
            {procedure.description}
          </p>
        )}
      </div>
      <div className={ROW_DATA}>
        <AreasAndSteps procedure={procedure} />
      </div>
      {/* Empty when it is not in progress: the column stays where it is. */}
      <div className={`${ROW_DATA} max-md:empty:hidden`}>
        {running && (
          <InProgressMark order={running.currentStep.order} total={running.totalSteps} />
        )}
      </div>
      <StartButton {...props} className={ROW_ACTION} />
    </li>
  );
}

interface ResumeStripProps {
  item: MyResumeItem;
  title: string;
  moreCount: number;
  view: ExecutionsView;
}

function ResumeStrip({ item, title, moreCount, view }: ResumeStripProps) {
  const headingId = useId();
  const titleId = useId();
  const { order } = item.currentStep;

  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col gap-4 rounded-2xl border border-bosque/15 bg-salvia p-5 sm:p-6"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <div className="shrink-0 rounded-xl bg-blanco p-2 shadow-sm">
            <ProgressNest
              total={item.totalSteps}
              finishedCount={order - 1}
              currentNumber={order}
              className="w-16 sm:w-20"
            />
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <h2
              id={headingId}
              className="text-sm font-semibold tracking-wide text-chip-area-texto uppercase"
            >
              Para retomar
            </h2>
            <p id={titleId} className="break-words text-xl font-bold text-texto">
              {title}
            </p>
            <p className="text-texto-suave">
              Vas por el paso {order} de {item.totalSteps} · lo dejaste hace{' '}
              {timeSince(item.lastActivityAt)}
            </p>
          </div>
        </div>
        <Link
          href={`/ejecuciones/${item.executionId}`}
          aria-describedby={titleId}
          className={`${LIST_BUTTON_PRIMARY} w-full shrink-0 sm:w-auto`}
        >
          Continuar<span aria-hidden="true"> →</span>
        </Link>
      </div>
      {/* The others, all of them, on "Mi actividad", in the same view. */}
      {moreCount > 0 && (
        <Link
          href={withExecutionsView(RESUME_SECTION_HREF, view)}
          className={`${TEXT_LINK} inline-flex min-h-11 items-center self-start rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-naranja`}
        >
          {moreInProgressLabel(moreCount)}
        </Link>
      )}
    </section>
  );
}

function ChevronIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="pointer-events-none absolute top-1/2 right-3 size-5 -translate-y-1/2 text-bosque"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

// The shape of what comes, in the chosen view: the strip, the search row and four cards or rows.
export function PickerSkeleton({ view = 'tarjetas' }: { view?: ExecutionsView }) {
  return (
    <div
      aria-hidden="true"
      data-view={view}
      className="flex animate-pulse flex-col gap-6 motion-reduce:animate-none"
    >
      <div className="h-28 rounded-2xl bg-borde" />
      <div className="flex flex-col gap-3 lg:flex-row">
        <div className="h-12 rounded-xl bg-borde lg:flex-1" />
        <div className="h-12 rounded-xl bg-borde lg:w-96" />
      </div>
      {view === 'lista' ? (
        <div className="flex flex-col gap-px overflow-hidden rounded-2xl">
          {[1, 2, 3, 4].map((n) => (
            <div key={n} className="h-20 bg-borde" />
          ))}
        </div>
      ) : (
        <div className={CARD_GRID}>
          {[1, 2, 3, 4].map((n) => (
            <div key={n} className="h-44 rounded-2xl bg-borde" />
          ))}
        </div>
      )}
    </div>
  );
}
