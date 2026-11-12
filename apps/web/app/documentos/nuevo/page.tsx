// /documentos/nuevo: carga de un documento, solo ADMIN (F1, F12).
// Otro rol ve el mensaje de RequireRole y el formulario ni se monta. La API igual responde 403.
// El formulario va en un solo bloque con tres pasos numerados (Archivo, Datos, Quién lo cuida) y la
// vista previa al lado: por eso la página es más ancha que antes (plan 002, D9).
// La ruta ("Documentos › Cargar documento") y "Cancelar" vuelven a la vista con la que se entró
// (?vista=): como leen la dirección, van dentro de un <Suspense>.
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Breadcrumb, DocumentsBreadcrumb } from '@/components/documents/DocumentsBreadcrumb';
import { UploadDocumentForm } from '@/components/documents/UploadDocumentForm';
import { PageHeader } from '@/components/documents/list-design';
import { RequireRole } from '@/components/session/RequireRole';
import { ScreenState } from '@/components/ui/ScreenState';

export const metadata: Metadata = {
  title: 'Cargar documento · Manual de operaciones',
};

const CURRENT = 'Cargar documento';

export default function NuevoDocumentoPage() {
  return (
    // pb-28: espacio al pie para que "Cargar documento" pueda quedar por encima de lo que flota abajo
    // (en desarrollo, la insignia de Next y el selector de sesión).
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 pt-8 pb-28">
      <Suspense fallback={<Breadcrumb href="/documentos" current={CURRENT} />}>
        <DocumentsBreadcrumb current={CURRENT} />
      </Suspense>
      <PageHeader title={CURRENT} subtitle="Subí un PDF, .txt o .md y elegí quién lo cuida." />
      <RequireRole role="ADMIN" deniedMessage="No tenés permiso para cargar documentos.">
        <Suspense fallback={<ScreenState kind="loading" label="Cargando el formulario…" />}>
          <UploadDocumentForm />
        </Suspense>
      </RequireRole>
    </main>
  );
}
