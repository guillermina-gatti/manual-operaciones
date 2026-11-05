// /documentos/alertas: las alertas de documentos que se contradicen (spec 011, F6), solo ADMIN. Otro rol
// ve el mensaje de RequireRole (pareja A, sin cambiarlo) y la lista ni se monta; la API igual responde
// 403. Lo que usa useSearchParams va dentro de un <Suspense> (cacheComponents). Es un segmento fijo:
// Next lo resuelve antes que /documentos/[id].
import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { ConflictAlertList } from '@/components/documents/ConflictAlertList';
import { BACK_LINK, PageHeader } from '@/components/documents/design';
import { RequireRole } from '@/components/session/RequireRole';
import { ScreenState } from '@/components/ui/ScreenState';

export const metadata: Metadata = {
  title: 'Alertas · Manual de operaciones',
};

export default function AlertasPage() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8">
      <Link href="/documentos" className={BACK_LINK}>
        <span aria-hidden="true">←&nbsp;</span>Volver a Documentos
      </Link>
      <PageHeader title="Alertas" subtitle="Documentos vigentes que, según el asistente, se contradicen." />
      <Suspense fallback={<ScreenState kind="loading" label="Cargando las alertas…" />}>
        <RequireRole role="ADMIN" deniedMessage="No tenés permiso para ver las alertas.">
          <ConflictAlertList />
        </RequireRole>
      </Suspense>
    </main>
  );
}
