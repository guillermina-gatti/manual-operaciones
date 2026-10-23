// /documentos/nuevo: carga de un documento, solo ADMIN (F1, F12).
// Otro rol ve el mensaje de RequireRole y el formulario ni se monta. La API igual responde 403.
import type { Metadata } from 'next';
import Link from 'next/link';
import { UploadDocumentForm } from '@/components/documents/UploadDocumentForm';
import { RequireRole } from '@/components/session/RequireRole';

export const metadata: Metadata = {
  title: 'Cargar documento · Manual de operaciones',
};

export default function NuevoDocumentoPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8">
      <Link
        href="/documentos"
        className="inline-flex min-h-11 items-center self-start text-blue-700 hover:underline dark:text-blue-400"
      >
        <span aria-hidden="true">←&nbsp;</span>Volver a Documentos
      </Link>
      <h1 className="text-2xl font-semibold">Cargar documento</h1>
      <RequireRole role="ADMIN" deniedMessage="No tenés permiso para cargar documentos.">
        <UploadDocumentForm />
      </RequireRole>
    </main>
  );
}
