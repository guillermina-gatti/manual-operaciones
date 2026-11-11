'use client';

// The two sections that edit the draft (HU09): its title and description, and its steps. They are
// shown while the version the screen works on is a draft.
import { useId } from 'react';
import type { EditableProcedure } from '@/lib/procedures/editable';
import { DraftForm } from './DraftForm';
import { SECTION, SECTION_TITLE } from './design';
import { StepsEditor } from './StepsEditor';

interface DraftSectionsProps {
  procedure: EditableProcedure;
  onChange: (next: EditableProcedure) => void;
  // The draft is gone: leave the screen.
  onGone: () => void;
}

export function DraftSections({ procedure, onChange, onGone }: DraftSectionsProps) {
  const baseId = useId();
  return (
    <>
      <section aria-labelledby={`${baseId}-draft`} className={SECTION}>
        <h2 id={`${baseId}-draft`} className={SECTION_TITLE}>
          Borrador
        </h2>
        <DraftForm procedure={procedure} onChange={onChange} onGone={onGone} />
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
