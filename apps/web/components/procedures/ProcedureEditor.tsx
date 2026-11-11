'use client';

// One procedure for the ADMIN (HU09, HU10, HU11 and HU32): it asks the API for it and shows the editor,
// or the state that takes its place (spec 006, W6, W7 and W9). Nothing is kept in the browser storage.
import { useParams } from 'next/navigation';
import { ScreenState } from '@/components/ui/ScreenState';
import { describeProcedureError } from '@/lib/procedures';
import { ProcedureEditorBody } from './ProcedureEditorBody';
import { ProcedureNotFound } from './ProcedureNotFound';
import { Skeleton } from './Skeleton';
import { useEditableProcedure } from './useEditableProcedure';

export function ProcedureEditor() {
  const { id } = useParams<{ id: string }>();
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

  return <ProcedureEditorBody procedure={procedure} onChange={update} />;
}
