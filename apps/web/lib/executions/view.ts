// The view of the procedure picker (/ejecuciones) and of "Para retomar" (/ejecuciones/mi-actividad):
// Tarjetas (by default) or Lista. As in /documentos, it lives only in the address (?vista=lista),
// never in localStorage: each link and the "back" button keep it. The parameter has the same name
// as in /documentos, but each screen reads its own address, so neither one changes the other.
import { VIEW_PARAM } from '@/lib/documents/view';

export type ExecutionsView = 'tarjetas' | 'lista';

export { VIEW_PARAM };

// Without the parameter, or with a value that does not exist, Tarjetas.
export function parseExecutionsView(value: string | null | undefined): ExecutionsView {
  return value === 'lista' ? 'lista' : 'tarjetas';
}

// An address with the view: Tarjetas writes nothing. A #fragment stays at the end.
// withExecutionsView('/ejecuciones/mi-actividad#para-retomar', 'lista')
//   → '/ejecuciones/mi-actividad?vista=lista#para-retomar'
export function withExecutionsView(href: string, view: ExecutionsView): string {
  if (view === 'tarjetas') return href;
  const [path, hash] = href.split('#');
  const withParam = `${path}${path.includes('?') ? '&' : '?'}${VIEW_PARAM}=lista`;
  return hash === undefined ? withParam : `${withParam}#${hash}`;
}

// The same address with another view: keeps the other parameters (search, filters).
export function hrefForExecutionsView(
  pathname: string,
  params: URLSearchParams,
  view: ExecutionsView,
): string {
  const next = new URLSearchParams(params);
  if (view === 'lista') next.set(VIEW_PARAM, 'lista');
  else next.delete(VIEW_PARAM);
  const query = next.toString();
  return query ? `${pathname}?${query}` : pathname;
}
