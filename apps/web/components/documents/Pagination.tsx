// Paginación por números del listado (F7, P6). Son enlaces: el botón "atrás" del navegador
// vuelve a la página anterior y cada página tiene su dirección.
import Link from 'next/link';
import { pageCount, pageNumbers } from '@/lib/documents/pagination';

interface PaginationProps {
  currentPage: number;
  totalItems: number;
  pageSize: number;
  // Spec 004 (F3, D11): con una búsqueda activa, cada enlace conserva ?q=.
  query?: string;
  // Spec 005: otra ruta, como /documentos/por-revisar. Por defecto, el listado.
  basePath?: string;
  // Spec 011: otro parámetro que cada enlace conserva, ya codificado (por ejemplo, "estado=resueltas").
  extraQuery?: string;
}

// La página 1 es la ruta sola (o con ?q=…), sin ?pagina=1: una sola dirección para la primera página.
function pageHref(page: number, query: string | undefined, basePath: string, extraQuery?: string): string {
  const params = [
    ...(query === undefined ? [] : [`q=${encodeURIComponent(query)}`]),
    ...(extraQuery ? [extraQuery] : []),
    ...(page === 1 ? [] : [`pagina=${page}`]),
  ];
  return params.length === 0 ? basePath : `${basePath}?${params.join('&')}`;
}

// Al menos 44 × 44 px, para tocarlos en el celular (F10). Como los filtros del diseño: la actual en
// bosque, las demás blancas con borde.
const ITEM =
  'inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl px-3 text-sm transition-[background-color,transform] active:translate-y-px motion-reduce:transition-none motion-reduce:active:translate-y-0';
const LINK = `${ITEM} border border-borde bg-blanco font-semibold text-bosque hover:bg-salvia`;
const CURRENT = `${ITEM} bg-bosque font-semibold text-blanco`;

export function Pagination({
  currentPage,
  totalItems,
  pageSize,
  query,
  basePath = '/documentos',
  extraQuery,
}: PaginationProps) {
  const pages = pageCount(totalItems, pageSize);
  if (pages <= 1) return null;

  const page = Math.min(Math.max(currentPage, 1), pages);

  return (
    <nav aria-label="Páginas" className="flex flex-wrap items-center justify-center gap-2">
      {page > 1 && (
        <Link href={pageHref(page - 1, query, basePath, extraQuery)} className={LINK}>
          <span aria-hidden="true">‹&nbsp;</span>Anterior
        </Link>
      )}

      {pageNumbers(page, pages).map((item, index) =>
        item === '…' ? (
          // Solo visual: no hay nada que leer.
          <span key={`gap-${index}`} aria-hidden="true" className={ITEM}>
            …
          </span>
        ) : (
          <Link
            key={item}
            href={pageHref(item, query, basePath, extraQuery)}
            aria-label={`Página ${item}`}
            aria-current={item === page ? 'page' : undefined}
            className={item === page ? CURRENT : LINK}
          >
            {item}
          </Link>
        ),
      )}

      {page < pages && (
        <Link href={pageHref(page + 1, query, basePath, extraQuery)} className={LINK}>
          Siguiente<span aria-hidden="true">&nbsp;›</span>
        </Link>
      )}
    </nav>
  );
}
