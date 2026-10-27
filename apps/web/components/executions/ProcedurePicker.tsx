'use client';

// Choosing a procedure to execute (HU12). The same button starts a new execution or resumes the
// one in progress: the API decides (201 or 200) and either way the screen opens it.
import { useRouter } from 'next/navigation';
import { useId, useLayoutEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { ScreenState } from '@/components/ui/ScreenState';
import { describeExecutionError, startExecution } from '@/lib/api';
import { SAMPLE_PROCEDURES } from '@/lib/executions/sample-procedures';
import type { ProcedureOption } from '@/lib/executions/sample-procedures';

interface ProcedurePickerProps {
  procedures?: readonly ProcedureOption[];
}

export function ProcedurePicker({ procedures = SAMPLE_PROCEDURES }: ProcedurePickerProps) {
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
        <p
          role="alert"
          className="rounded-lg border border-red-300 bg-red-50 p-4 text-red-800 shadow-sm dark:border-red-800 dark:bg-red-950 dark:text-red-200"
        >
          {error}
        </p>
      )}
      <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-6">
        {procedures.map((procedure) => (
          <li
            key={procedure.id}
            className="flex min-w-0 flex-col justify-between gap-6 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm transition duration-200 focus-within:border-blue-400 focus-within:shadow-md hover:border-blue-300 hover:shadow-md motion-safe:hover:-translate-y-0.5 dark:border-zinc-700 dark:bg-zinc-900 dark:focus-within:border-blue-500 dark:hover:border-blue-500/70"
          >
            <div className="flex min-w-0 flex-col gap-3">
              <h2
                id={`${baseId}-${procedure.id}`}
                className="break-words text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50"
              >
                {procedure.name}
              </h2>
              {/* The area as a chip. */}
              <p className="inline-flex items-center gap-1 self-start rounded-full bg-blue-50 px-3 py-1 text-sm text-blue-800 ring-1 ring-inset ring-blue-200 dark:bg-blue-950 dark:text-blue-200 dark:ring-blue-800">
                Área: <span className="font-semibold">{procedure.areaName}</span>
              </p>
            </div>
            <Button
              // `!` wins over Button's own size classes without editing it; still at least 44 px.
              className="min-h-12! w-full rounded-lg! px-6! text-base shadow-sm sm:w-auto sm:self-start"
              // Every button says the same; the description tells which procedure it opens.
              aria-describedby={`${baseId}-${procedure.id}`}
              disabled={startingId !== null}
              onClick={() => start(procedure.id)}
            >
              {startingId === procedure.id ? 'Abriendo…' : 'Comenzar o continuar'}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
