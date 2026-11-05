// Spec 009 (F4, D14): las marcas [S1], [S2]… de la respuesta, como citas numeradas. La respuesta de
// la API no dice qué marca es cada fuente: sources trae solo los fragmentos citados, en el orden en
// que se recuperaron. Por eso las marcas distintas, de menor a mayor, se cruzan en ese orden con las
// fuentes. Si la cantidad no coincide, el texto queda sin marcas y las fuentes se muestran aparte.

export type CitationSegment = { type: 'text'; text: string } | { type: 'cite'; number: number };

const MARKER = /\[S(\d+)\]/g;

export function linkCitations(answer: string, sourceCount: number): CitationSegment[] {
  const markers = [...new Set([...answer.matchAll(MARKER)].map((m) => Number(m[1])))].sort((a, b) => a - b);

  if (markers.length !== sourceCount) {
    const text = answer.replace(/\s?\[S\d+\]/g, '');
    return text ? [{ type: 'text', text }] : [];
  }

  const numberOf = new Map(markers.map((marker, index) => [marker, index + 1]));
  const segments: CitationSegment[] = [];
  let last = 0;
  for (const match of answer.matchAll(MARKER)) {
    const start = match.index ?? 0;
    if (start > last) segments.push({ type: 'text', text: answer.slice(last, start) });
    segments.push({ type: 'cite', number: numberOf.get(Number(match[1]))! });
    last = start + match[0].length;
  }
  if (last < answer.length) segments.push({ type: 'text', text: answer.slice(last) });
  return segments;
}
