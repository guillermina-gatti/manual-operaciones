'use client';

// The read-only screen of one procedure, for SUPERVISOR and EMPLOYEE (spec 006, W5, W7 and W9): it asks
// the API and shows the sheet, or the state that takes its place. The id comes from the address.
import { useParams } from 'next/navigation';
import { ScreenState } from '@/components/ui/ScreenState';
import { describeProcedureError } from '@/lib/procedures';
import { ProcedureNotFound } from './ProcedureNotFound';
import { ProcedureSheet } from './ProcedureSheet';
import { Skeleton } from './Skeleton';
import { useProcedureDetail } from './useProcedureDetail';

export function ProcedureReadView() {
  const { id } = useParams<{ id: string }>();
  const procedure = useProcedureDetail(id);

  if (procedure.status === 'idle' || procedure.status === 'loading') {
    return (
      <ScreenState kind="loading" label="Cargando el procedimiento…">
        <Skeleton heights={['h-12 w-2/3', 'h-40', 'h-32', 'h-32']} />
      </ScreenState>
    );
  }
  if (procedure.status === 'error') {
    const { message, notFound } = describeProcedureError(procedure.error, 'versions');
    if (notFound) return <ProcedureNotFound />;
    return <ScreenState kind="error" message={message} onRetry={procedure.reload} />;
  }

  return <ProcedureSheet procedure={procedure.data} />;
}
