// /documentos/nuevo: carga de un documento, solo ADMIN (F1, F12).
// Otro rol ve el mensaje de RequireRole y el formulario ni se monta. La API igual responde 403.
// El formulario va en tres secciones (cada una en su tarjeta) con la vista previa al lado: por eso la
// página es más ancha que antes y no envuelve el formulario en otra tarjeta.
import type { Metadata } from 'next';
import { BackLink } from '@/components/documents/BackToDocuments';
import { UploadDocumentForm } from '@/components/documents/UploadDocumentForm';
import { PageHeader } from '@/components/documents/list-design';
import { RequireRole } from '@/components/session/RequireRole';

export const metadata: Metadata = {
  title: 'Cargar documento · Manual de operaciones',
};

export default function NuevoDocumentoPage() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8">
      <BackLink href="/documentos" />
      <PageHeader
        title="Cargar documento"
        subtitle="Subí un PDF, .txt o .md y elegí quién lo cuida."
      />
      <RequireRole role="ADMIN" deniedMessage="No tenés permiso para cargar documentos.">
        <UploadDocumentForm />
      </RequireRole>
    </main>
  );
}
