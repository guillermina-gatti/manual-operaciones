import type { Metadata } from 'next';
import Link from 'next/link';
import { InvitationsHistoryTable } from '@/components/admin/InvitationsHistoryTable';
import { InviteUserForm } from '@/components/admin/InviteUserForm';
import { RolePermissionsCard } from '@/components/admin/RolePermissionsCard';
import { RequireRole } from '@/components/session/RequireRole';

export const metadata: Metadata = {
  title: 'Invitar usuario · Manual de operaciones',
};

export default function AdminInvitationsPage() {
  return (
    <RequireRole role="ADMIN" deniedMessage="Solo los administradores pueden gestionar e invitar usuarios.">
      <main className="min-h-[calc(100vh-65px)] bg-[#F4F6F5] px-4 py-8 sm:py-10">
        <div className="mx-auto max-w-6xl space-y-8">
          {/* Encabezado */}
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <div className="flex items-center gap-2 text-xs text-zinc-500">
                <Link href="/documentos" className="hover:underline">Inicio</Link>
                <span>/</span>
                <span className="font-medium text-zinc-700">Administración</span>
                <span>/</span>
                <span className="text-[#0B4233] font-medium">Invitar usuario</span>
              </div>
              <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-[#0B4233] sm:text-3xl">
                Invitar usuario a PispIAr
              </h1>
              <p className="mt-1 text-sm text-[#6B7671]">
                Emití un enlace de acceso seguro de un solo uso para que la persona complete su registro.
              </p>
            </div>
          </div>

          {/* Grilla 2 columnas */}
          <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-12">
            <div className="lg:col-span-7">
              <InviteUserForm />
            </div>
            <div className="lg:col-span-5">
              <RolePermissionsCard />
            </div>
          </div>

          {/* Historial y revocación de invitaciones emitidas */}
          <InvitationsHistoryTable />
        </div>
      </main>
    </RequireRole>
  );
}
