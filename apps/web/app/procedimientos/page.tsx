// /procedimientos: test screens for HU09 and HU10 (create a procedure and edit its draft). Only ADMIN:
// another role sees RequireRole's message and the screen is not even mounted. The API answers 403 anyway.
import type { Metadata } from 'next';
import { PageHeader } from '@/components/documents/list-design';
import { ProcedureList } from '@/components/procedures/ProcedureList';
import { RequireRole } from '@/components/session/RequireRole';

export const metadata: Metadata = {
  title: 'Procedimientos · Manual de operaciones',
};

export default function ProcedimientosPage() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-4 pt-8 pb-28 text-base">
      <PageHeader
        title="Procedimientos"
        subtitle="Creá un procedimiento y armá su borrador con pasos y áreas."
      />
      <RequireRole
        role="ADMIN"
        deniedMessage="Solo un administrador puede crear y editar procedimientos."
      >
        <ProcedureList />
      </RequireRole>
    </main>
  );
}
