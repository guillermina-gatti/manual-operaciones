'use client';

// One page of the list of procedures, read from the API (spec 006, W1). The API filters by role and
// areas: the web does not filter or complete anything.
import { useState } from 'react';
import { useApiResource } from '@/lib/api';
import type { ApiResource } from '@/lib/api';
import { listProcedures } from '@/lib/procedures';
import type { ProcedureListPage } from '@/lib/procedures';

export const PROCEDURES_PAGE_SIZE = 12;

// Asking again keeps the cards on screen until the new answer arrives (spec 015, D28): the list does
// not go back to "Cargando" each time the draft changes. Another page does start empty.
export function useProcedureList(page: number): ApiResource<ProcedureListPage> {
  const list = useProcedureListRequest(page);
  const [last, setLast] = useState<{ page: number; data: ProcedureListPage } | null>(null);
  if (list.status === 'success' && last?.data !== list.data) setLast({ page, data: list.data });
  if (list.status === 'loading' && last?.page === page) {
    return { status: 'success', data: last.data, error: null, reload: list.reload };
  }
  return list;
}

function useProcedureListRequest(page: number): ApiResource<ProcedureListPage> {
  return useApiResource(`procedures:list:${page}`, (signal) =>
    listProcedures({ page, limit: PROCEDURES_PAGE_SIZE }, signal),
  );
}
