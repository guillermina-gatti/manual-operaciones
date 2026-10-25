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
}

// La página 1 es /documentos (o /documentos?q=…), sin ?pagina=1: una sola dirección para la primera
// página.
function pageHref(page: number, query?: string): string {
  const params = [
    ...(query === undefined ? [] : [`q=${encodeURIComponent(query)}`]),
    ...(page === 1 ? [] : [`pagina=${page}`]),
  ];
  return params.length === 0 ? '/documentos' : `/documentos?${params.join('&')}`;
}

// Al menos 44 × 44 px, para tocarlos en el celular (F10).
const ITEM =
  'inline-flex min-h-11 min-w-11 items-center justify-center rounded-md px-3 text-sm';
const LINK = `${ITEM} border border-zinc-300 hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-blue-600 dark:border-zinc-600 dark:hover:bg-zinc-800`;
const CURRENT = `${ITEM} bg-blue-700 font-semibold text-white dark:bg-blue-500 dark:text-zinc-950`;

export function Pagination({ currentPage, totalItems, pageSize, query }: PaginationProps) {
  const pages = pageCount(totalItems, pageSize);
  if (pages <= 1) return null;

  const page = Math.min(Math.max(currentPage, 1), pages);

  return (
    <nav aria-label="Páginas" className="flex flex-wrap items-center justify-center gap-2">
      {page > 1 && (
        <Link href={pageHref(page - 1, query)} className={LINK}>
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
            href={pageHref(item, query)}
            aria-label={`Página ${item}`}
            aria-current={item === page ? 'page' : undefined}
            className={item === page ? CURRENT : LINK}
          >
            {item}
          </Link>
        ),
      )}

      {page < pages && (
        <Link href={pageHref(page + 1, query)} className={LINK}>
          Siguiente<span aria-hidden="true">&nbsp;›</span>
        </Link>
      )}
    </nav>
  );
}
