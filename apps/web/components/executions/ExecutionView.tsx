'use client';

// Step-by-step execution of a procedure (HU12, spec 005). The API decides who can see it: for
// another employee, a missing execution or a lost area it answers the same 404.
import { useParams } from 'next/navigation';
import { useLayoutEffect, useRef, useState } from 'react';
import { ExecutionChatPanel } from '@/components/chat/ExecutionChatPanel';
import { CHIP, ERROR_BOX, PageHeader } from '@/components/documents/design';
import { ScreenState } from '@/components/ui/ScreenState';
import {
  ApiError,
  completeStep,
  describeExecutionError,
  EXECUTION_MESSAGES,
  getExecution,
  useApiResource,
} from '@/lib/api';
import type { ExecutionResponse } from '@/lib/api';
import { SAMPLE_PROCEDURES, procedureName } from '@/lib/executions/sample-procedures';
import { summarizeExecution } from '@/lib/executions/summary';
import { useSession } from '@/lib/session';
import { CompletedPanel } from './CompletedPanel';
import { ExecutionProgress } from './ExecutionProgress';
import { ExecutionSummaryCard } from './ExecutionSummaryCard';
import { StepList } from './StepList';

// The same format the API accepts (ParseUUIDPipe). Any other id cannot exist.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const LOADING = (
  <ScreenState kind="loading" label="Cargando la ejecución…">
    <ExecutionSkeleton />
  </ScreenState>
);

const NOT_FOUND = <ScreenState kind="error" message={EXECUTION_MESSAGES.executionNotFound} />;

export function ExecutionView() {
  const { user, status } = useSession();
  const { id } = useParams<{ id: string }>();
  const validId = UUID.test(id);

  // An id that is not a UUID is not requested: the API would answer 400.
  const key = user && validId ? `execution:${id}:${user.id}` : null;
  const execution = useApiResource(key, (signal) => getExecution(id, signal));

  if (status === 'loading') return LOADING;
  if (status === 'disabled') {
    return (
      <ScreenState
        kind="error"
        message={describeExecutionError(new ApiError(401), 'detail').message}
      />
    );
  }
  if (!user) return <ScreenState kind="empty" message="Elegí un usuario de prueba" />;
  if (!validId) return NOT_FOUND;

  if (execution.status === 'loading' || execution.status === 'idle') return LOADING;

  if (execution.status === 'error') {
    const { message, canRetry } = describeExecutionError(execution.error, 'detail');
    return (
      <ScreenState kind="error" message={message} onRetry={canRetry ? execution.reload : undefined} />
    );
  }

  // A new key (another user) mounts a new screen, without the state of the previous one.
  return <ExecutionScreen key={key} initial={execution.data} />;
}

function ExecutionScreen({ initial }: { initial: ExecutionResponse }) {
  // Each completed step replaces the loaded execution with the API response, but only while the
  // loaded one is the same: a newer load (coming back to the screen) wins.
  const [latest, setLatest] = useState<{
    from: ExecutionResponse;
    value: ExecutionResponse;
  } | null>(null);
  const execution = latest?.from === initial ? latest.value : initial;
  const [notice, setNotice] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [completing, setCompleting] = useState(false);
  // A step was finished in this screen: no longer "resumed", and the focus follows the next step.
  const [completedHere, setCompletedHere] = useState(false);
  // Stops a second click that arrives before React renders the disabled button.
  const completingRef = useRef(false);
  // Changes each time the screen is hidden, so a late answer from before is ignored.
  const visitRef = useRef(0);

  // With cacheComponents, Next hides this page with <Activity> when navigating away and shows the
  // same instance on return. The cleanup runs on hide; on return useApiResource asks for the
  // execution again and the screen shows that answer.
  useLayoutEffect(
    () => () => {
      visitRef.current += 1;
      completingRef.current = false;
      setCompleting(false);
      setLatest(null);
      setNotice(null);
      setNotFound(false);
      setCompletedHere(false);
    },
    [],
  );

  if (notFound) return NOT_FOUND;

  const setExecution = (value: ExecutionResponse) => setLatest({ from: initial, value });

  const summary = summarizeExecution(execution);
  const completed = execution.status === 'COMPLETED';
  // The execution only brings the procedure id; its area comes from the sample procedures.
  const areaName = SAMPLE_PROCEDURES.find((p) => p.id === execution.procedureId)?.areaName;
  const resumed = summary.resumed && !completedHere;

  async function complete(stepId: string) {
    if (completingRef.current) return;
    completingRef.current = true;
    const visit = visitRef.current;
    const left = () => visitRef.current !== visit;
    setCompleting(true);
    setNotice(null);
    try {
      const updated = await completeStep(execution.id, stepId);
      if (left()) return;
      setExecution(updated);
      setCompletedHere(true);
    } catch (failure) {
      if (left()) return;
      const { message, notFound: missing } = describeExecutionError(failure, 'complete');
      if (missing) {
        setNotFound(true);
        return;
      }
      setNotice(message);
      // 409: the execution changed somewhere else (another tab). Show it as it is now.
      if (failure instanceof ApiError && failure.status === 409) await refresh(left);
    } finally {
      // After leaving, the hide cleanup already reset these, and a new click may be running.
      if (!left()) {
        completingRef.current = false;
        setCompleting(false);
      }
    }
  }

  async function refresh(left: () => boolean) {
    try {
      const current = await getExecution(execution.id);
      if (!left()) setExecution(current);
    } catch (failure) {
      // Otherwise the notice stays and the steps keep the last known state.
      if (!left() && describeExecutionError(failure, 'detail').notFound) setNotFound(true);
    }
  }

  return (
    <div className="grid min-w-0 grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <article className="flex min-w-0 flex-col gap-6 sm:gap-8">
        <div className="flex min-w-0 flex-col gap-3">
          <PageHeader
            title={procedureName(execution.procedureId)}
            subtitle="Seguí los pasos en orden y marcá cada uno cuando lo termines."
          />
          {(areaName || resumed) && (
            <div className="flex flex-wrap items-center gap-2">
              {areaName && (
                <span className={`${CHIP} bg-chip-area text-chip-area-texto`}>{areaName}</span>
              )}
              {/* Salvia, not celeste: in the design, celeste is only for the assistant. */}
              {resumed && (
                <p className={`${CHIP} bg-salvia text-texto`}>Retomaste donde quedaste</p>
              )}
            </div>
          )}
        </div>

        <ExecutionProgress summary={summary} />

        {completed && (
          <CompletedPanel
            procedureName={procedureName(execution.procedureId)}
            totalDurationMs={summary.totalDurationMs}
          />
        )}

        {notice && (
          <p role="alert" className={ERROR_BOX}>
            {notice}
          </p>
        )}

        <StepList
          execution={execution}
          completing={completing}
          onComplete={complete}
          focusCurrent={completedHere}
        />
      </article>

      {/* The side column: our summary and, below it, the assistant of pair C for the current step
          (spec 010), untouched. The assistant is hidden once the execution is completed, so screen
          readers do not announce an empty region. On a phone the column goes below the steps;
          from lg on, it is on the right. */}
      <div className="flex min-w-0 flex-col gap-6">
        <ExecutionSummaryCard execution={execution} summary={summary} />
        <aside data-slot="chat-panel" aria-label="Asistente" hidden={completed} className="min-w-0">
          <ExecutionChatPanel execution={execution} />
        </aside>
      </div>
    </div>
  );
}

export function ExecutionSkeleton() {
  return (
    <div aria-hidden="true" className="flex animate-pulse flex-col gap-6">
      <div className="h-12 w-2/3 rounded-xl bg-borde" />
      <div className="h-24 w-full rounded-2xl bg-borde" />
      <div className="h-32 w-full rounded-2xl bg-borde" />
      <div className="h-24 w-full rounded-2xl bg-borde" />
      <div className="h-24 w-full rounded-2xl bg-borde" />
    </div>
  );
}
