'use client';

// Choosing a procedure to execute (HU12). The procedures come from GET /api/procedures (HU11),
// which only gives the ones of the user's areas; only a published version with steps can be
// executed. The same button starts a new execution or resumes the one in progress: the API
// decides (201 or 200) and either way the screen opens it.
import { useRouter } from 'next/navigation';
import { useId, useLayoutEffect, useRef, useState } from 'react';
import { AreaChips, BUTTON_PRIMARY, CARD, ERROR_BOX } from '@/components/documents/design';
import { ScreenState } from '@/components/ui/ScreenState';
import { describeExecutionError, startExecution, useApiResource } from '@/lib/api';
import {
  describeListError,
  executableProcedures,
} from '@/lib/executions/executable-procedures';
import type { ExecutableProcedure } from '@/lib/executions/executable-procedures';
import { listProcedures } from '@/lib/procedures';
import { useSession } from '@/lib/session';

// The API gives up to 100 per page; for the MVP the first page is enough.
const PAGE_LIMIT = 100;

interface ProcedurePickerProps {
  // Given, the list is not asked to the API (tests).
  procedures?: readonly ExecutableProcedure[];
}

export function ProcedurePicker({ procedures }: ProcedurePickerProps) {
  return procedures ? (
    <ProcedureCards procedures={procedures} />
  ) : (
    <PublishedProcedures />
  );
}

function PublishedProcedures() {
  const { user } = useSession();
  // The user is part of the key: switching users asks again.
  const list = useApiResource(user ? `executable-procedures:${user.id}` : null, (signal) =>
    listProcedures({ limit: PAGE_LIMIT }, signal),
  );

  if (list.status === 'idle' || list.status === 'loading') {
    return <ScreenState kind="loading" label="Cargando los procedimientos…" />;
  }
  if (list.status === 'error') {
    const { message, canRetry } = describeListError(list.error);
    return <ScreenState kind="error" message={message} onRetry={canRetry ? list.reload : undefined} />;
  }
  return <ProcedureCards procedures={executableProcedures(list.data.data)} />;
}

function ProcedureCards({ procedures }: { procedures: readonly ExecutableProcedure[] }) {
  const router = useRouter();
  const baseId = useId();
  const [startingId, setStartingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
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

  if (procedures.length === 0) {
    return <ScreenState kind="empty" message="Todavía no hay procedimientos para ejecutar." />;
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

  return (
    <div className="flex flex-col gap-6">
      {error && (
        <p role="alert" className={ERROR_BOX}>
          {error}
        </p>
      )}
      <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-6">
        {procedures.map((procedure) => (
          <li
            key={procedure.id}
            className={`${CARD} flex min-w-0 flex-col justify-between gap-6 p-6 transition-shadow focus-within:shadow-md hover:shadow-md sm:p-8`}
          >
            <div className="flex min-w-0 flex-col gap-3">
              <h2
                id={`${baseId}-${procedure.id}`}
                className="break-words text-[22px] font-bold text-texto"
              >
                {procedure.title}
              </h2>
              {/* One chip per area; "Áreas:" only for screen readers. */}
              <div className="self-start">
                <span className="sr-only">Áreas: </span>
                <AreaChips areas={procedure.areas} />
              </div>
            </div>
            <button
              type="button"
              className={`${BUTTON_PRIMARY} w-full sm:w-auto sm:self-start`}
              // Every button says the same; the description tells which procedure it opens.
              aria-describedby={`${baseId}-${procedure.id}`}
              disabled={startingId !== null}
              onClick={() => start(procedure.id)}
            >
              {startingId === procedure.id ? 'Abriendo…' : 'Comenzar o continuar'}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
