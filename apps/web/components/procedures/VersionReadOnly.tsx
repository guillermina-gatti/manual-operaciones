'use client';

// A version that cannot be changed (spec 015, R6 and R9): its description and steps in order, read
// from the API. It has no field and no button: a published or superseded version is not edited.
import { useId } from 'react';
import { HINT } from '@/components/documents/design';
import { ScreenState } from '@/components/ui/ScreenState';
import { useApiResource } from '@/lib/api';
import { getVersion } from '@/lib/procedures';
import type { VersionDetail } from '@/lib/procedures';
import { VERSION_LABELS } from '@/lib/procedures/versions';
import { SECTION, SECTION_TITLE, StepNumber } from './design';
import { Skeleton } from './Skeleton';

function Steps({ version }: { version: VersionDetail }) {
  if (version.steps.length === 0) return <p className="text-texto-suave">No tiene pasos.</p>;
  return (
    <ol aria-label="Pasos" className="flex flex-col gap-4">
      {version.steps.map((step) => (
        <li key={step.id} className="flex min-w-0 items-start gap-4">
          <StepNumber>{step.order}</StepNumber>
          <div className="flex min-w-0 flex-col gap-1 pt-1.5">
            <p className="break-words text-lg font-semibold leading-snug">{step.title}</p>
            {step.description && (
              <p className="whitespace-pre-line break-words text-texto-suave">{step.description}</p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

export function VersionReadOnly({ procedureId, versionId }: { procedureId: string; versionId: string }) {
  const titleId = useId();
  const version = useApiResource(`procedure-version:${versionId}`, (signal) =>
    getVersion(procedureId, versionId, signal),
  );

  if (version.status === 'loading' || version.status === 'idle') {
    return (
      <ScreenState kind="loading" label="Cargando la versión…">
        <Skeleton heights={['h-24', 'h-40']} />
      </ScreenState>
    );
  }
  if (version.status === 'error') {
    return <ScreenState kind="error" message="No pudimos cargar la versión." onRetry={version.reload} />;
  }

  const { data } = version;
  return (
    <section aria-labelledby={titleId} className={SECTION}>
      <h2 id={titleId} className={SECTION_TITLE}>
        Versión {data.versionNumber} · {VERSION_LABELS[data.status]}
      </h2>
      <p className={`${HINT} -mt-3`}>Esta versión ya no se puede modificar.</p>
      {data.description && <p className="break-words">{data.description}</p>}
      <Steps version={data} />
    </section>
  );
}
