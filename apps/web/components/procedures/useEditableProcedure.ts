'use client';

// The procedure the editor works on (spec 006, W6): what the API answers for the id, and the changes
// the API accepted since (each one replaces the procedure in memory, without asking again). When the
// API answers again (a retry, or coming back to the screen), what it says wins over the changes.
import { useMemo, useState } from 'react';
import type { ApiResource } from '@/lib/api';
import { fromDetail } from '@/lib/procedures/editable';
import type { EditableProcedure } from '@/lib/procedures/editable';
import type { ProcedureDetail } from '@/lib/procedures';
import { useProcedureDetail } from './useProcedureDetail';

interface Edit {
  source: ProcedureDetail;
  value: EditableProcedure;
}

export function useEditableProcedure(id: string): {
  detail: ApiResource<ProcedureDetail>;
  procedure: EditableProcedure | null;
  update: (next: EditableProcedure) => void;
} {
  const detail = useProcedureDetail(id);
  const [edit, setEdit] = useState<Edit | null>(null);
  const source = detail.status === 'success' ? detail.data : null;
  const base = useMemo(() => (source ? fromDetail(source) : null), [source]);

  // A change only counts for the answer it was made on.
  const procedure = source && edit?.source === source ? edit.value : base;
  const update = (next: EditableProcedure) => {
    if (source) setEdit({ source, value: next });
  };

  return { detail, procedure, update };
}
