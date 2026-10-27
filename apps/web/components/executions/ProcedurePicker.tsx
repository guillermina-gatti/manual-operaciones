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
    <div className="flex flex-col gap-4">
      {error && (
        <p
          role="alert"
          className="rounded-md border border-red-300 bg-red-50 p-3 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
        >
          {error}
        </p>
      )}
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {procedures.map((procedure) => (
          <li
            key={procedure.id}
            className="flex min-w-0 flex-col gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-700"
          >
            <div className="flex min-w-0 flex-col gap-1">
              <h2 id={`${baseId}-${procedure.id}`} className="break-words text-lg font-semibold">
                {procedure.name}
              </h2>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Área: <span>{procedure.areaName}</span>
              </p>
            </div>
            <Button
              className="self-start"
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
