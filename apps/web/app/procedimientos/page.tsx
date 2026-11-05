// /procedimientos: test screens for HU09 and HU10 (create a procedure and edit its draft). Only ADMIN:
// another role sees RequireRole's message and the screen is not even mounted. The API answers 403 anyway.
import type { Metadata } from 'next';
import { PageHeader } from '@/components/procedures/design';
import { ProcedureList } from '@/components/procedures/ProcedureList';
import { RequireRole } from '@/components/session/RequireRole';

export const metadata: Metadata = {
  title: 'Procedimientos · Manual de operaciones',
};

export default function ProcedimientosPage() {
  return (
    <div className="flex-1">
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10 sm:px-6 sm:py-14">
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
    </div>
  );
}
