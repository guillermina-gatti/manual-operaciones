// The steps of a procedure as read-only cards (spec 006, W5): the number in a green circle, the title
// and the description. The list is ordered: the numbers are the order of the version.
import { CARD } from '@/components/documents/design';
import type { VersionStep } from '@/lib/api/procedure-versions';
import { StepNumber } from './design';

export function ProcedureStepCards({ steps }: { steps: VersionStep[] }) {
  if (steps.length === 0) return <p className="text-texto-suave">No tiene pasos.</p>;

  return (
    <ol aria-label="Pasos" className="flex flex-col gap-4">
      {steps.map((step) => (
        <li key={step.id} className={`${CARD} flex min-w-0 items-start gap-4 p-5`}>
          <StepNumber>{step.order}</StepNumber>
          <div className="flex min-w-0 flex-col gap-1 pt-1.5">
            <h3 className="break-words text-lg leading-snug font-semibold">{step.title}</h3>
            {step.description && (
              <p className="whitespace-pre-line break-words text-texto-suave">{step.description}</p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
