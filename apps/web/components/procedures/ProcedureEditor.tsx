'use client';

// One procedure for the ADMIN (HU09, HU10, HU11 and HU32): it asks the API for it and shows the editor,
// or the state that takes its place (spec 006, W6, W7 and W9). Nothing is kept in the browser storage.
// ProcedureEditor reads the id from the address; ProcedureEditorById is the same editor for an id that
// the screen already has (spec 015, D21: the draft that was just created, inside the list screen).
import { useParams } from 'next/navigation';
import { ScreenState } from '@/components/ui/ScreenState';
import { describeProcedureError } from '@/lib/procedures';
import { ProcedureEditorBody } from './ProcedureEditorBody';
import { ProcedureNotFound } from './ProcedureNotFound';
import { Skeleton } from './Skeleton';
import { useEditableProcedure } from './useEditableProcedure';

interface ProcedureEditorByIdProps {
  id: string;
  // Inside another screen: no back link and no h1 (that screen has them).
  embedded?: boolean;
  // The draft is gone (discarded, or the API does not know it); the default goes back to the list.
  onGone?: () => void;
}

export function ProcedureEditor() {
  const { id } = useParams<{ id: string }>();
  return <ProcedureEditorById id={id} />;
}

export function ProcedureEditorById({ id, embedded = false, onGone }: ProcedureEditorByIdProps) {
  const { detail, procedure, update } = useEditableProcedure(id);

  if (detail.status === 'error') {
    const { message, notFound } = describeProcedureError(detail.error, 'versions');
    if (notFound) return <ProcedureNotFound />;
    return <ScreenState kind="error" message={message} onRetry={detail.reload} />;
  }
  if (!procedure) {
    return (
      <ScreenState kind="loading" label="Cargando el procedimiento…">
        <Skeleton heights={['h-12 w-2/3', 'h-48', 'h-64', 'h-32']} />
      </ScreenState>
    );
  }

  return <ProcedureEditorBody procedure={procedure} embedded={embedded} onGone={onGone} onChange={update} />;
}
