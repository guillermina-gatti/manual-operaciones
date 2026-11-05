// Spec 009 (R8, HU36): el enlace a la búsqueda sin IA. La misma regla que buildSearchUrl de la API
// (apps/api/src/chat/chat-search-url.ts); la web la usa cuando no llegó searchUrl (un corte o un error).
import { SEARCH_MAX, SEARCH_MIN } from '@/lib/documents/search-rules';

export function buildSearchUrl(question: string): string {
  let text = question.replace(/\s+/g, ' ').trim();
  if (text.length > SEARCH_MAX) {
    const cut = text.lastIndexOf(' ', SEARCH_MAX);
    text = (cut > 0 ? text.slice(0, cut) : text.slice(0, SEARCH_MAX)).trim();
  }
  return text.length < SEARCH_MIN ? '/documentos' : `/documentos?q=${encodeURIComponent(text)}`;
}

// El texto que se busca, para mostrarlo en el enlace ("Buscar «…» en los documentos").
export function searchTextOf(url: string): string | null {
  const query = url.split('?q=')[1];
  return query ? decodeURIComponent(query) : null;
}
