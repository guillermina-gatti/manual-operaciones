// La vista del listado de /documentos: Lista (por defecto) o Tarjetas. Vive solo en la dirección
// (?vista=tarjetas), nunca en localStorage: cada enlace y el botón "atrás" la conservan.
export type DocumentsView = 'lista' | 'tarjetas';

export const VIEW_PARAM = 'vista';

// Sin el parámetro, o con un valor que no existe, Lista.
export function parseViewParam(value: string | null | undefined): DocumentsView {
  return value === 'tarjetas' ? 'tarjetas' : 'lista';
}

// Lo que se suma a una dirección para conservar la vista (la Lista no escribe nada: es la de siempre).
// Sirve como `extraQuery` de Pagination.
export function viewQuery(view: DocumentsView): string | undefined {
  return view === 'tarjetas' ? `${VIEW_PARAM}=tarjetas` : undefined;
}

// Una dirección con la vista: withView('/documentos?q=caja', 'tarjetas') → '/documentos?q=caja&vista=tarjetas'.
export function withView(href: string, view: DocumentsView): string {
  const extra = viewQuery(view);
  if (!extra) return href;
  return `${href}${href.includes('?') ? '&' : '?'}${extra}`;
}

// La misma dirección con otra vista: conserva la búsqueda y la página.
export function hrefForView(
  pathname: string,
  params: URLSearchParams,
  view: DocumentsView,
): string {
  const next = new URLSearchParams(params);
  if (view === 'tarjetas') next.set(VIEW_PARAM, 'tarjetas');
  else next.delete(VIEW_PARAM);
  const query = next.toString();
  return query ? `${pathname}?${query}` : pathname;
}
