/* Arma el fragmento de un resultado de búsqueda: partes de texto plano y qué palabras resaltar (spec 004, R8 y R11) */

// Marcadores que pone ts_headline alrededor de cada palabra encontrada (plan 004, 4.2). Son caracteres
// Unicode de uso privado; la consulta los quita del contenido antes de marcar, así un documento no
// puede inyectar marcas falsas.
export const MATCH_START = '';
export const MATCH_END = '';

export interface FragmentPart {
  text: string;
  match: boolean;
}

// Una "palabra" es una secuencia sin espacios del texto plano, con su posición.
interface Word {
  start: number;
  end: number;
  marked: boolean;
}

// D8: separa por los marcadores y recorta a la ventana de `maxWords` palabras con más palabras
// marcadas (a igualdad, la primera). Corta solo en los espacios, así nunca parte una palabra marcada,
// y agrega "…" donde se cortó. La salida es texto plano, sin marcadores ni HTML.
export function buildFragment(
  markedText: string,
  { maxWords = 30 }: { maxWords?: number } = {},
): FragmentPart[] {
  const { plain, ranges } = parseMarks(markedText);
  const words = splitWords(plain, ranges);
  if (words.length === 0) return [];

  if (words.length <= maxWords) return slice(plain, ranges, 0, plain.length);

  const first = bestWindow(words, maxWords);
  const start = words[first].start;
  const end = words[first + maxWords - 1].end;

  const parts = slice(plain, ranges, start, end);
  if (start > 0) parts.unshift({ text: '… ', match: false });
  if (end < plain.length) parts.push({ text: ' …', match: false });
  return merge(parts);
}

// Quita los marcadores y devuelve dónde estaba cada palabra encontrada en el texto plano. Un marcador
// desparejo se descarta: abrir dos veces sigue abierto, cerrar sin abrir no hace nada, y lo que quedó
// abierto al final se cierra ahí.
function parseMarks(markedText: string) {
  let plain = '';
  const ranges: [number, number][] = [];
  let openAt: number | null = null;

  for (const char of markedText) {
    if (char === MATCH_START) {
      openAt ??= plain.length;
    } else if (char === MATCH_END) {
      if (openAt !== null && plain.length > openAt) {
        ranges.push([openAt, plain.length]);
      }
      openAt = null;
    } else {
      plain += char;
    }
  }
  if (openAt !== null && plain.length > openAt) {
    ranges.push([openAt, plain.length]);
  }
  return { plain, ranges };
}

function splitWords(plain: string, ranges: [number, number][]): Word[] {
  const words: Word[] = [];
  for (const found of plain.matchAll(/\S+/g)) {
    const start = found.index;
    const end = start + found[0].length;
    const marked = ranges.some(([from, to]) => from < end && to > start);
    words.push({ start, end, marked });
  }
  return words;
}

// La primera ventana con la mayor cantidad de palabras marcadas (ventana deslizante).
function bestWindow(words: Word[], size: number): number {
  let count = 0;
  for (let i = 0; i < size; i++) if (words[i].marked) count++;

  let best = 0;
  let bestCount = count;
  for (let first = 1; first + size <= words.length; first++) {
    if (words[first - 1].marked) count--;
    if (words[first + size - 1].marked) count++;
    if (count > bestCount) {
      best = first;
      bestCount = count;
    }
  }
  return best;
}

// Las partes del texto plano entre `start` y `end`, marcadas según los rangos.
function slice(
  plain: string,
  ranges: [number, number][],
  start: number,
  end: number,
): FragmentPart[] {
  const parts: FragmentPart[] = [];
  let cursor = start;
  for (const [from, to] of ranges) {
    const markFrom = Math.max(from, start);
    const markTo = Math.min(to, end);
    if (markTo <= markFrom) continue;
    if (markFrom > cursor) {
      parts.push({ text: plain.slice(cursor, markFrom), match: false });
    }
    parts.push({ text: plain.slice(markFrom, markTo), match: true });
    cursor = markTo;
  }
  if (cursor < end) parts.push({ text: plain.slice(cursor, end), match: false });
  return parts;
}

// Junta partes vecinas del mismo tipo (por ejemplo, "… " con el texto sin marcar que la sigue).
function merge(parts: FragmentPart[]): FragmentPart[] {
  const merged: FragmentPart[] = [];
  for (const part of parts) {
    const last = merged.at(-1);
    if (last && last.match === part.match && !part.match) {
      last.text += part.text;
    } else {
      merged.push({ ...part });
    }
  }
  return merged;
}
