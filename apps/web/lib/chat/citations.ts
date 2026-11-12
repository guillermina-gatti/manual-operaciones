// Spec 009 (F4, D14): las marcas [S1], [S2]… de la respuesta, como citas numeradas. La respuesta de
// la API no dice qué marca es cada fuente: sources trae solo los fragmentos citados, en el orden en
// que se recuperaron. Por eso las marcas distintas, de menor a mayor, se cruzan en ese orden con las
// fuentes. Si la cantidad no coincide, el texto queda sin marcas y las fuentes se muestran aparte.

export type CitationSegment = { type: 'text'; text: string } | { type: 'cite'; number: number };

const MARKER = /\[S(\d+)\]/g;

// El número de cita de cada marca, calculado sobre la respuesta entera; null si las marcas no coinciden
// con las fuentes (entonces se quitan). Separado de splitCitations para que el Markdown (párrafos,
// listas, negritas) pueda partir el texto sin cambiar la numeración.
export function citationNumbers(answer: string, sourceCount: number): Map<number, number> | null {
  const markers = [...new Set([...answer.matchAll(MARKER)].map((m) => Number(m[1])))].sort((a, b) => a - b);
  if (markers.length !== sourceCount) return null;
  return new Map(markers.map((marker, index) => [marker, index + 1]));
}

// Un pedazo de la respuesta, en texto y citas, con la numeración de citationNumbers.
export function splitCitations(text: string, numbers: Map<number, number> | null): CitationSegment[] {
  if (!numbers) {
    const plain = text.replace(/\s?\[S\d+\]/g, '');
    return plain ? [{ type: 'text', text: plain }] : [];
  }

  const segments: CitationSegment[] = [];
  let last = 0;
  for (const match of text.matchAll(MARKER)) {
    const start = match.index ?? 0;
    const number = numbers.get(Number(match[1]));
    // Una marca que no está en la respuesta entera no puede aparecer en un pedazo; por las dudas, se quita.
    if (start > last) segments.push({ type: 'text', text: text.slice(last, start) });
    if (number !== undefined) segments.push({ type: 'cite', number });
    last = start + match[0].length;
  }
  if (last < text.length) segments.push({ type: 'text', text: text.slice(last) });
  return segments;
}

export function linkCitations(answer: string, sourceCount: number): CitationSegment[] {
  return splitCitations(answer, citationNumbers(answer, sourceCount));
}
