'use client';

// /procedimientos/[id] by role (spec 006, W5 and W6): the editor for an ADMIN, the read-only sheet for
// SUPERVISOR and EMPLOYEE. It is only the choice: the API decides what each one can read.
import { useSession } from '@/lib/session';
import { ProcedureEditor } from './ProcedureEditor';
import { ProcedureReadView } from './ProcedureReadView';

export function ProcedureDetailScreen() {
  const { user } = useSession();

  return user?.role === 'ADMIN' ? <ProcedureEditor /> : <ProcedureReadView />;
}
