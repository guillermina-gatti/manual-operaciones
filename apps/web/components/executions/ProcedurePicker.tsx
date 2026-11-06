'use client';

// Choosing a procedure to execute (HU12). The same button starts a new execution or resumes the
// one in progress: the API decides (201 or 200) and either way the screen opens it.
import { useRouter } from 'next/navigation';
import { useId, useLayoutEffect, useRef, useState } from 'react';
import { BUTTON_PRIMARY, CARD, CHIP, ERROR_BOX } from '@/components/documents/design';
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
                {procedure.name}
              </h2>
              {/* The area as a chip; "Área:" only for screen readers. */}
              <p className={`${CHIP} self-start bg-chip-area text-chip-area-texto`}>
                <span className="sr-only">Área: </span>
                {procedure.areaName}
              </p>
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
