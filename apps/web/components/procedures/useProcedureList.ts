'use client';

// One page of the list of procedures, read from the API (spec 006, W1). The API filters by role and
// areas: the web does not filter or complete anything.
import { useApiResource } from '@/lib/api';
import type { ApiResource } from '@/lib/api';
import { listProcedures } from '@/lib/procedures';
import type { ProcedureListPage } from '@/lib/procedures';

export const PROCEDURES_PAGE_SIZE = 12;

export function useProcedureList(page: number): ApiResource<ProcedureListPage> {
  return useApiResource(`procedures:list:${page}`, (signal) =>
    listProcedures({ page, limit: PROCEDURES_PAGE_SIZE }, signal),
  );
}
