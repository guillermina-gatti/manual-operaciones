'use client';

// The two sections that edit the draft (HU09; spec 015, D22 and D23): the "Borrador" card (title,
// description and areas) and the steps. They are shown while the version the screen works on is a
// draft. The card waits for the list of areas, because the chips are part of it.
import { useId } from 'react';
import { ScreenState } from '@/components/ui/ScreenState';
import { useApiResource } from '@/lib/api';
import { areasDirectory } from '@/lib/directory';
import type { EditableProcedure } from '@/lib/procedures/editable';
import { DraftForm } from './DraftForm';
import { SECTION, SECTION_TITLE } from './design';
import { Skeleton } from './Skeleton';
import { StepsEditor } from './StepsEditor';

interface DraftSectionsProps {
  procedure: EditableProcedure;
  onChange: (next: EditableProcedure) => void;
  // The draft is gone: leave the screen.
  onGone: () => void;
}

export function DraftSections({ procedure, onChange, onGone }: DraftSectionsProps) {
  const baseId = useId();
  const areas = useApiResource('procedure-areas', () => areasDirectory.listAreas());

  return (
    <>
      <section aria-labelledby={`${baseId}-draft`} className={SECTION}>
        <h2 id={`${baseId}-draft`} className={SECTION_TITLE}>
          Borrador
        </h2>
        {areas.status === 'success' ? (
          <DraftForm procedure={procedure} areas={areas.data} onChange={onChange} onGone={onGone} />
        ) : areas.status === 'error' ? (
          <ScreenState kind="error" message="No pudimos cargar las áreas." onRetry={areas.reload} />
        ) : (
          <ScreenState kind="loading" label="Cargando el borrador…">
            <Skeleton heights={['h-12', 'h-12', 'h-12']} />
          </ScreenState>
        )}
      </section>

      <section aria-labelledby={`${baseId}-steps`} className={SECTION}>
        <h2 id={`${baseId}-steps`} className={SECTION_TITLE}>
          Pasos
        </h2>
        <StepsEditor procedure={procedure} onChange={onChange} onGone={onGone} />
      </section>
    </>
  );
}
