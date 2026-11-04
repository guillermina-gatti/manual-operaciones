// /documentos/nuevo: carga de un documento, solo ADMIN (F1, F12).
// Otro rol ve el mensaje de RequireRole y el formulario ni se monta. La API igual responde 403.
import type { Metadata } from 'next';
import Link from 'next/link';
import { UploadDocumentForm } from '@/components/documents/UploadDocumentForm';
import { BACK_LINK, Card, PageHeader } from '@/components/documents/design';
import { RequireRole } from '@/components/session/RequireRole';

export const metadata: Metadata = {
  title: 'Cargar documento · Manual de operaciones',
};

export default function NuevoDocumentoPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-8">
      <Link href="/documentos" className={BACK_LINK}>
        <span aria-hidden="true">←&nbsp;</span>Volver a Documentos
      </Link>
      <PageHeader
        title="Cargar documento"
        subtitle="Subí un PDF, .txt o .md y elegí quién lo cuida."
      />
      <RequireRole role="ADMIN" deniedMessage="No tenés permiso para cargar documentos.">
        <Card>
          <UploadDocumentForm />
        </Card>
      </RequireRole>
    </main>
  );
}
