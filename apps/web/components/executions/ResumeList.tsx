// "Para retomar": the employee's executions still in progress, of any date (the period does not
// apply), the most recently moved first. Each one says at which step it is, when it last moved
// and, if it has been more than 24 h without progress, says so with its text, not only a color.
import Link from 'next/link';
import { useId } from 'react';
import { BUTTON_PRIMARY, CARD, StatusDot } from '@/components/documents/design';
import type { MyResumeItem } from '@/lib/api';
import { formatLastActivity, staleLabel } from '@/lib/executions/my-activity';
import { metricsProcedureName } from '@/lib/metrics/procedure-name';

interface ResumeListProps {
  items: MyResumeItem[];
  staleAfterHours: number;
}

export function ResumeList({ items, staleAfterHours }: ResumeListProps) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id={headingId} className="text-2xl font-bold text-texto">
          Para retomar
        </h2>
        <p className="text-texto-suave">
          Tus ejecuciones sin terminar, de cualquier fecha. Seguís desde el paso donde quedaste.
        </p>
      </div>

      {items.length === 0 ? (
        <p className={`${CARD} px-6 py-10 text-center text-texto-suave`}>
          No tenés ejecuciones sin terminar.
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {items.map((item) => (
            <ResumeCard key={item.executionId} item={item} staleAfterHours={staleAfterHours} />
          ))}
        </ul>
      )}
    </section>
  );
}

function ResumeCard({ item, staleAfterHours }: { item: MyResumeItem; staleAfterHours: number }) {
  const nameId = useId();
  const { currentStep, totalSteps } = item;
  return (
    <li className={`${CARD} flex min-w-0 flex-col gap-4 p-6`}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <h3 id={nameId} className="min-w-0 break-words text-xl font-bold text-texto">
          {metricsProcedureName(item.procedureId, item.procedureTitle)}
        </h3>
        {item.stale ? (
          <StatusDot tone="durazno">{staleLabel(staleAfterHours)}</StatusDot>
        ) : (
          <StatusDot tone="azul">En curso</StatusDot>
        )}
      </div>
      <dl className="flex flex-col gap-1">
        <div className="flex flex-wrap gap-x-2">
          <dt className="text-texto-suave">
            Paso {currentStep.order} de {totalSteps}:
          </dt>
          <dd className="min-w-0 break-words font-semibold text-texto">{currentStep.title}</dd>
        </div>
        <div className="flex flex-wrap gap-x-2 text-sm">
          <dt className="text-texto-suave">Último avance:</dt>
          <dd className="text-texto tabular-nums">{formatLastActivity(item.lastActivityAt)}</dd>
        </div>
      </dl>
      <Link
        href={`/ejecuciones/${item.executionId}`}
        aria-describedby={nameId}
        className={`${BUTTON_PRIMARY} self-start`}
      >
        Retomar →
      </Link>
    </li>
  );
}
