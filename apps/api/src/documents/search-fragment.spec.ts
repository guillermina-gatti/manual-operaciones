// Fragmento con las palabras marcadas (spec 004, R8 y R11; plan 004, 4.2 y D8).
import {
  MATCH_END,
  MATCH_START,
  buildFragment,
  type FragmentPart,
} from './search-fragment';

const mark = (word: string) => `${MATCH_START}${word}${MATCH_END}`;
const join = (parts: FragmentPart[]) => parts.map((part) => part.text).join('');
const matches = (parts: FragmentPart[]) =>
  parts.filter((part) => part.match).map((part) => part.text);
// "p1 p2 … pN": palabras numeradas para ubicar la ventana.
const words = (count: number, marked: number[] = []) =>
  Array.from({ length: count }, (_, i) =>
    marked.includes(i + 1) ? mark(`p${i + 1}`) : `p${i + 1}`,
  ).join(' ');

describe('buildFragment', () => {
  it('separa el texto en partes según los marcadores, en orden', () => {
    const parts = buildFragment(
      `se hace el ${mark('cierre')} de ${mark('caja')} diario`,
    );

    expect(parts).toEqual([
      { text: 'se hace el ', match: false },
      { text: 'cierre', match: true },
      { text: ' de ', match: false },
      { text: 'caja', match: true },
      { text: ' diario', match: false },
    ]);
  });

  it('un fragmento corto queda entero y sin "…"', () => {
    const parts = buildFragment(`Instrucción ${mark('técnica')}`);

    expect(join(parts)).toBe('Instrucción técnica');
    expect(join(parts)).not.toContain('…');
  });

  it('con una marca en la palabra 60 de 100, recorta alrededor y agrega "…" a los dos lados', () => {
    const parts = buildFragment(words(100, [60]), { maxWords: 30 });
    const text = join(parts);

    expect(matches(parts)).toEqual(['p60']);
    expect(text.startsWith('… ')).toBe(true);
    expect(text.endsWith(' …')).toBe(true);
    // 30 palabras, más los dos "…".
    expect(text.replace(/…/g, '').trim().split(/\s+/)).toHaveLength(30);
  });

  it('si la marca está al principio, no agrega "…" adelante', () => {
    const text = join(buildFragment(words(100, [2]), { maxWords: 30 }));

    expect(text.startsWith('p1 ')).toBe(true);
    expect(text.endsWith(' …')).toBe(true);
  });

  it('si la marca está al final, no agrega "…" atrás', () => {
    const text = join(buildFragment(words(100, [100]), { maxWords: 30 }));

    expect(text.startsWith('… ')).toBe(true);
    expect(text.endsWith('p100')).toBe(true);
  });

  it('elige la ventana con más palabras marcadas', () => {
    const parts = buildFragment(words(200, [10, 150, 155, 160]), {
      maxWords: 30,
    });

    expect(matches(parts)).toEqual(['p150', 'p155', 'p160']);
  });

  it('a igual cantidad de marcas, elige la primera ventana', () => {
    const parts = buildFragment(words(200, [20, 150]), { maxWords: 30 });

    expect(matches(parts)).toEqual(['p20']);
  });

  it('dos palabras marcadas seguidas', () => {
    const parts = buildFragment(`el ${mark('cierre')} ${mark('caja')}`);

    expect(matches(parts)).toEqual(['cierre', 'caja']);
    expect(join(parts)).toBe('el cierre caja');
  });

  it('una marca pegada a puntuación no se pierde ni se corta', () => {
    const parts = buildFragment(`dice «${mark('caja')}», y sigue`);

    expect(parts).toEqual([
      { text: 'dice «', match: false },
      { text: 'caja', match: true },
      { text: '», y sigue', match: false },
    ]);
  });

  it('nunca corta una palabra marcada pegada a puntuación en el borde de la ventana', () => {
    const marked = `${words(40)} («${mark('caja')}»), ${words(40)}`;
    const parts = buildFragment(marked, { maxWords: 30 });

    expect(matches(parts)).toEqual(['caja']);
    expect(join(parts)).toContain('(«caja»),');
  });

  // E12 y R11: el HTML del documento es texto; no se borra ni se interpreta.
  it('deja literal el HTML del documento', () => {
    const parts = buildFragment(`<script>alert(1)</script> ${mark('caja')}`);

    expect(parts).toEqual([
      { text: '<script>alert(1)</script> ', match: false },
      { text: 'caja', match: true },
    ]);
  });

  it('ningún marcador queda en la salida, aunque estén desparejos', () => {
    const parts = buildFragment(
      `a ${MATCH_END}b ${mark('caja')} ${MATCH_START}c`,
    );
    const text = join(parts);

    expect(text).not.toContain(MATCH_START);
    expect(text).not.toContain(MATCH_END);
    expect(matches(parts)).toContain('caja');
  });

  it('sin marcas devuelve el principio del texto', () => {
    const parts = buildFragment(words(50), { maxWords: 30 });

    expect(matches(parts)).toEqual([]);
    expect(join(parts).startsWith('p1 ')).toBe(true);
  });

  it('un texto vacío da una lista vacía', () => {
    expect(buildFragment('')).toEqual([]);
  });

  it('por defecto recorta a 30 palabras', () => {
    const text = join(buildFragment(words(100, [50])));

    expect(text.replace(/…/g, '').trim().split(/\s+/)).toHaveLength(30);
  });
});
