// El ícono de tipo de archivo de /documentos: hoja en el tono suave del tipo, extensión (y en el
// grande, el glifo) en la tinta oscura del mismo color. Los colores salen de FILE_TYPE_COLORS.
import { render } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import {
  FILE_TYPE_COLORS,
  FileTypeIcon,
  fileTypeKind,
} from '@/components/documents/list-design';
import type { FileTypeKind } from '@/components/documents/list-design';

function renderIcon(fileName: string, size: 'sm' | 'lg' = 'lg') {
  const { container } = render(<FileTypeIcon fileName={fileName} size={size} />);
  const svg = container.querySelector('svg')!;
  return {
    svg,
    sheet: svg.querySelector('path')!,
    text: svg.querySelector('text')!,
    glyph: svg.querySelector('[data-part="glyph"]'),
  };
}

describe('fileTypeKind', () => {
  test.each<[string, FileTypeKind]>([
    ['manual.pdf', 'pdf'],
    ['MANUAL.PDF', 'pdf'],
    ['notas.md', 'doc'],
    ['informe.docx', 'doc'],
    ['informe.doc', 'doc'],
    ['leeme.txt', 'text'],
    ['ventas.xlsx', 'sheet'],
    ['ventas.csv', 'sheet'],
    ['charla.pptx', 'slides'],
    ['foto.png', 'text'],
    ['sin-extension', 'text'],
  ])('%s → %s', (fileName, kind) => {
    expect(fileTypeKind(fileName)).toBe(kind);
  });

  test('los tres tipos que hoy se pueden cargar tienen colores distintos', () => {
    const backgrounds = ['a.pdf', 'a.md', 'a.txt'].map(
      (name) => FILE_TYPE_COLORS[fileTypeKind(name)].background,
    );
    expect(new Set(backgrounds).size).toBe(3);
  });
});

describe('FileTypeIcon', () => {
  test.each([
    ['manual.pdf', FILE_TYPE_COLORS.pdf],
    ['notas.md', FILE_TYPE_COLORS.doc],
    ['leeme.txt', FILE_TYPE_COLORS.text],
  ])('%s: hoja en el fondo del tipo y extensión en su tinta', (fileName, colors) => {
    const { sheet, text } = renderIcon(fileName);

    expect(sheet).toHaveAttribute('fill', colors.background);
    expect(text).toHaveAttribute('fill', colors.ink);
  });

  test('el grande lleva el glifo y la extensión, en la misma tinta', () => {
    const { glyph, text } = renderIcon('manual.pdf', 'lg');

    expect(glyph).toHaveAttribute('stroke', FILE_TYPE_COLORS.pdf.ink);
    expect(text).toHaveTextContent('PDF');
  });

  test('el chico lleva solo la extensión, con los mismos colores', () => {
    const { glyph, sheet, text } = renderIcon('manual.pdf', 'sm');

    expect(glyph).toBeNull();
    expect(text).toHaveTextContent('PDF');
    expect(sheet).toHaveAttribute('fill', FILE_TYPE_COLORS.pdf.background);
    expect(text).toHaveAttribute('fill', FILE_TYPE_COLORS.pdf.ink);
  });

  test('es decorativo: el tipo lo dice el texto de quien lo usa', () => {
    const { svg } = renderIcon('manual.pdf');

    expect(svg).toHaveAttribute('aria-hidden', 'true');
  });
});
