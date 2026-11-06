'use client';

// "← Volver a Documentos" del detalle: vuelve a la vista con la que se entró. La vista viaja en la
// dirección del detalle (?vista=tarjetas, la pone la tarjeta de la vista Tarjetas); sin ella, o con un
// valor que no existe, vuelve a la Lista, como siempre.
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { VIEW_PARAM, parseViewParam, withView } from '@/lib/documents/view';
import { BACK_LINK } from './design';

// El enlace en sí. El detalle lo usa solo como fallback del <Suspense> (a /documentos), mientras
// BackToDocuments lee la dirección.
export function BackLink({ href }: { href: string }) {
  return (
    <Link href={href} className={`${BACK_LINK} group`}>
      {/* La flecha se corre a la izquierda al pasar; quieta si se pide menos movimiento. */}
      <span
        aria-hidden="true"
        className="inline-block transition-transform group-hover:-translate-x-0.5 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0"
      >
        ←&nbsp;
      </span>
      Volver a Documentos
    </Link>
  );
}

export function BackToDocuments() {
  const view = parseViewParam(useSearchParams().get(VIEW_PARAM));
  return <BackLink href={withView('/documentos', view)} />;
}
