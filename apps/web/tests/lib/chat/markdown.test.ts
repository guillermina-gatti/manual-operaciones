// El Markdown de las respuestas del asistente: párrafos, listas, subtítulos y negritas, como datos.
import { describe, expect, test } from 'vitest';
import { parseInline, parseMarkdown } from '@/lib/chat/markdown';

const text = (value: string) => ({ type: 'text', text: value });
const strong = (value: string) => ({ type: 'strong', text: value });

describe('parseInline', () => {
  test('las negritas cerradas, entre texto común', () => {
    expect(parseInline('Se firma con **Recibido con faltantes** [S2].')).toEqual([
      text('Se firma con '),
      strong('Recibido con faltantes'),
      text(' [S2].'),
    ]);
  });

  test.each([['**sin cerrar'], ['** con espacios **'], ['2 ** 3'], ['*cursiva*']])('"%s" queda como texto', (value) => {
    expect(parseInline(value)).toEqual([text(value)]);
  });
});

describe('parseMarkdown', () => {
  test('párrafos separados por una línea en blanco, con los saltos de línea de adentro', () => {
    expect(parseMarkdown('Primera línea\nsegunda línea\n\nOtro párrafo')).toEqual([
      { type: 'paragraph', lines: [[text('Primera línea')], [text('segunda línea')]] },
      { type: 'paragraph', lines: [[text('Otro párrafo')]] },
    ]);
  });

  test('la explicación de una contradicción, con viñetas "*" y las citas en cada ítem', () => {
    const answer =
      'CONFLICT ya quitado:\n\n* [S1] establece que la ropa interior no tiene devolución.\n* [S3] indica que cualquier producto se devuelve en 60 días.';

    expect(parseMarkdown(answer)).toEqual([
      { type: 'paragraph', lines: [[text('CONFLICT ya quitado:')]] },
      {
        type: 'list',
        ordered: false,
        start: 1,
        items: [
          [text('[S1] establece que la ropa interior no tiene devolución.')],
          [text('[S3] indica que cualquier producto se devuelve en 60 días.')],
        ],
      },
    ]);
  });

  test('viñetas con "-" y "•", y un párrafo justo después de la lista', () => {
    expect(parseMarkdown('- uno\n• dos\nDespués.')).toEqual([
      { type: 'list', ordered: false, start: 1, items: [[text('uno')], [text('dos')]] },
      { type: 'paragraph', lines: [[text('Después.')]] },
    ]);
  });

  test('listas numeradas, con el número de inicio', () => {
    expect(parseMarkdown('3. Contá los bultos\n4) Anotá los faltantes')).toEqual([
      { type: 'list', ordered: true, start: 3, items: [[text('Contá los bultos')], [text('Anotá los faltantes')]] },
    ]);
  });

  test('una línea con sangría sigue el ítem anterior', () => {
    expect(parseMarkdown('* Anotá en el remito\n  la cantidad que falta')).toEqual([
      { type: 'list', ordered: false, start: 1, items: [[text('Anotá en el remito la cantidad que falta')]] },
    ]);
  });

  test('cambiar de viñetas a números empieza otra lista', () => {
    const blocks = parseMarkdown('* a\n1. b');
    expect(blocks.map((block) => block.type === 'list' && block.ordered)).toEqual([false, true]);
  });

  test('subtítulos "##" y "###", con negrita adentro; "#" solo es texto', () => {
    expect(parseMarkdown('## Plazos\n### Para **electrónica**\n# No es subtítulo')).toEqual([
      { type: 'heading', inline: [text('Plazos')] },
      { type: 'heading', inline: [text('Para '), strong('electrónica')] },
      { type: 'paragraph', lines: [[text('# No es subtítulo')]] },
    ]);
  });

  test('Markdown incompleto de la transmisión: la lista con lo que llegó y la negrita sin cerrar como texto', () => {
    expect(parseMarkdown('* uno\n* **do')).toEqual([
      { type: 'list', ordered: false, start: 1, items: [[text('uno')], [text('**do')]] },
    ]);
    // Una viñeta que recién empieza: un ítem vacío, que se completa con lo que llega.
    expect(parseMarkdown('* ')).toEqual([{ type: 'list', ordered: false, start: 1, items: [[]] }]);
  });

  test('saltos de línea de Windows', () => {
    expect(parseMarkdown('a\r\n\r\nb')).toEqual([
      { type: 'paragraph', lines: [[text('a')]] },
      { type: 'paragraph', lines: [[text('b')]] },
    ]);
  });

  test('el HTML del modelo queda como texto', () => {
    expect(parseMarkdown('<b>hola</b> <script>alert(1)</script>')).toEqual([
      { type: 'paragraph', lines: [[text('<b>hola</b> <script>alert(1)</script>')]] },
    ]);
  });

  test('sin texto, sin bloques', () => {
    expect(parseMarkdown('')).toEqual([]);
  });
});
