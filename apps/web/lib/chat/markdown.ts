// El Markdown de las respuestas del asistente, reducido a lo que usa el modelo: párrafos (separados por una
// línea en blanco, con saltos de línea adentro), listas con viñetas ("* ", "- ", "• ") o numeradas ("1. ",
// "1) "), subtítulos ("## " y "### ") y **negritas**. Devuelve datos, no HTML: la pantalla los dibuja como
// elementos de React con texto común, así nada de lo que mande el modelo se interpreta como HTML.
//
// Tolera el Markdown incompleto de la transmisión: una negrita sin cerrar queda como texto ("**hola") hasta
// que llega el cierre, y una lista a medio llegar se dibuja con los ítems que ya están.

export type Inline = { type: 'text'; text: string } | { type: 'strong'; text: string };

export type Block =
  | { type: 'paragraph'; lines: Inline[][] }
  | { type: 'heading'; inline: Inline[] }
  | { type: 'list'; ordered: boolean; start: number; items: Inline[][] };

const HEADING = /^\s{0,3}#{2,3}\s+(.*)$/;
const BULLET = /^\s{0,3}[*\-•]\s+(.*)$/;
const NUMBERED = /^\s{0,3}(\d{1,9})[.)]\s+(.*)$/;
// Una línea con sangría dentro de una lista sigue el ítem anterior.
const CONTINUATION = /^\s{2,}\S/;

// **texto**: el texto no empieza ni termina con espacio, y sin cierre no es negrita.
const STRONG = /\*\*(?=\S)([\s\S]*?\S)\*\*/g;

export function parseInline(text: string): Inline[] {
  const parts: Inline[] = [];
  let last = 0;
  for (const match of text.matchAll(STRONG)) {
    const start = match.index ?? 0;
    if (start > last) parts.push({ type: 'text', text: text.slice(last, start) });
    parts.push({ type: 'strong', text: match[1] });
    last = start + match[0].length;
  }
  if (last < text.length) parts.push({ type: 'text', text: text.slice(last) });
  return parts;
}

interface OpenBlock {
  paragraph: string[] | null;
  list: { ordered: boolean; start: number; items: string[] } | null;
}

export function parseMarkdown(text: string): Block[] {
  const blocks: Block[] = [];
  // Lo que se está armando: un párrafo (sus líneas) o una lista (sus ítems, en texto todavía).
  const open: OpenBlock = { paragraph: null, list: null };

  const close = () => {
    if (open.paragraph) blocks.push({ type: 'paragraph', lines: open.paragraph.map(parseInline) });
    if (open.list) {
      const { ordered, start, items } = open.list;
      blocks.push({ type: 'list', ordered, start, items: items.map(parseInline) });
    }
    open.paragraph = null;
    open.list = null;
  };

  const addItem = (ordered: boolean, start: number, item: string) => {
    if (!open.list || open.list.ordered !== ordered) {
      close();
      open.list = { ordered, start, items: [] };
    }
    open.list.items.push(item);
  };

  for (const line of text.replace(/\r\n?/g, '\n').split('\n')) {
    if (line.trim() === '') {
      close();
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      close();
      blocks.push({ type: 'heading', inline: parseInline(heading[1].trim()) });
      continue;
    }
    const bullet = BULLET.exec(line);
    if (bullet) {
      addItem(false, 1, bullet[1]);
      continue;
    }
    const numbered = NUMBERED.exec(line);
    if (numbered) {
      addItem(true, Number(numbered[1]), numbered[2]);
      continue;
    }
    if (open.list && CONTINUATION.test(line)) {
      const { items } = open.list;
      items[items.length - 1] = `${items[items.length - 1]} ${line.trim()}`;
      continue;
    }
    if (open.list) close();
    open.paragraph ??= [];
    open.paragraph.push(line);
  }
  close();
  return blocks;
}
