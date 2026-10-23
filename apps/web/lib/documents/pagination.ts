// Paginación por números del listado (F7, P6).

export type PageItem = number | '…';

// Cuántas páginas hay: 45 documentos de a 20 son 3.
export function pageCount(total: number, pageSize: number): number {
  return Math.ceil(total / pageSize);
}

// Qué números mostrar: la primera, la última, la actual y sus vecinas, con "…" donde se saltean páginas.
// Si el salto es de una sola página, se muestra el número: un "…" ocuparía lo mismo.
export function pageNumbers(current: number, total: number): PageItem[] {
  if (total <= 0) return [];
  const page = Math.min(Math.max(current, 1), total);

  const shown = [...new Set([1, page - 1, page, page + 1, total])]
    .filter((n) => n >= 1 && n <= total)
    .sort((a, b) => a - b);

  const items: PageItem[] = [];
  let previous = 0;
  for (const n of shown) {
    if (n - previous === 2) items.push(previous + 1);
    else if (n - previous > 2) items.push('…');
    items.push(n);
    previous = n;
  }
  return items;
}

// Lee ?pagina= de la dirección. Solo un entero desde 1; cualquier otra cosa es la primera página.
export function parsePageParam(value: string | null | undefined): number {
  if (!value || !/^\d+$/.test(value)) return 1;
  const page = Number(value);
  return Number.isSafeInteger(page) && page >= 1 ? page : 1;
}
