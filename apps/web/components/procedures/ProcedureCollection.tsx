'use client';

// The cards of the list, or the state that takes their place: loading, error or empty (spec 006, W1,
// W8 and W9). It only shows what the API answered for this user. The page links are real links:
// each page has its own address (?pagina=).
import { Pagination } from '@/components/documents/Pagination';
import { ScreenState } from '@/components/ui/ScreenState';
import type { ApiResource } from '@/lib/api';
import { describeProcedureError } from '@/lib/procedures';
import type { ProcedureListPage } from '@/lib/procedures';
import { ProcedureCard } from './ProcedureCard';
import { Skeleton } from './Skeleton';

const EMPTY_FOR_ADMIN = 'Todavía no hay procedimientos creados.';
const EMPTY_FOR_OTHERS = 'Todavía no hay procedimientos publicados en tus áreas.';

interface ProcedureCollectionProps {
  list: ApiResource<ProcedureListPage>;
  page: number;
  isAdmin: boolean;
}

export function ProcedureCollection({ list, page, isAdmin }: ProcedureCollectionProps) {
  if (list.status === 'idle' || list.status === 'loading') {
    return (
      <ScreenState kind="loading" label="Cargando procedimientos…">
        <Skeleton heights={['h-48', 'h-48', 'h-48', 'h-48']} />
      </ScreenState>
    );
  }
  if (list.status === 'error') {
    return (
      <ScreenState
        kind="error"
        message={describeProcedureError(list.error, 'versions').message}
        onRetry={list.reload}
      />
    );
  }

  const { data, total, limit } = list.data;
  return (
    <>
      {data.length === 0 ? (
        <ScreenState kind="empty" message={isAdmin ? EMPTY_FOR_ADMIN : EMPTY_FOR_OTHERS} />
      ) : (
        <ul className="grid gap-6 md:grid-cols-2">
          {data.map((procedure) => (
            <li key={procedure.id} className="min-w-0">
              <ProcedureCard procedure={procedure} />
            </li>
          ))}
        </ul>
      )}
      <Pagination currentPage={page} totalItems={total} pageSize={limit} basePath="/procedimientos" />
    </>
  );
}
