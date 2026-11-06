'use client';

// La ruta de las pantallas de Documentos: "Documentos › Manual de caja" en el detalle y "Documentos ›
// Cargar documento" en la carga. Reemplaza a "← Volver a Documentos" (plan 002, D9).
// "Documentos" es el único enlace y vuelve a la vista con la que se entró: la vista viaja en la dirección
// (?vista=tarjetas, la ponen la tarjeta y "Cargar documento"); sin ella, o con un valor que no existe,
// vuelve a la Lista, como siempre.
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { VIEW_PARAM, parseViewParam, withView } from '@/lib/documents/view';

interface BreadcrumbProps {
  // A dónde lleva "Documentos".
  href: string;
  // La pantalla actual. Sin ella, solo el enlace (mientras carga el detalle, o si falló).
  current?: string;
}

// La ruta en sí. Las páginas la usan como fallback del <Suspense> (a /documentos), mientras
// DocumentsBreadcrumb lee la dirección.
export function Breadcrumb({ href, current }: BreadcrumbProps) {
  return (
    <nav aria-label="Ruta" className="min-w-0">
      <ol className="flex min-w-0 items-center gap-2 text-sm">
        <li className="flex shrink-0 items-center">
          <Link
            href={href}
            className="inline-flex min-h-11 items-center rounded-lg font-semibold text-bosque underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-naranja"
          >
            Documentos
          </Link>
        </li>
        {current && (
          <li className="flex min-w-0 items-center gap-2">
            <span aria-hidden="true" className="text-texto-suave">
              ›
            </span>
            {/* Un título largo se recorta; completo en title (y en el h1 de la pantalla). */}
            <span aria-current="page" title={current} className="min-w-0 truncate text-texto-suave">
              {current}
            </span>
          </li>
        )}
      </ol>
    </nav>
  );
}

export function DocumentsBreadcrumb({ current }: { current?: string }) {
  const view = parseViewParam(useSearchParams().get(VIEW_PARAM));
  return <Breadcrumb href={withView('/documentos', view)} current={current} />;
}
