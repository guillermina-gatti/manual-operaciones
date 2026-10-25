import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { MatchFragment } from '@/components/documents/MatchFragment';
import type { SearchFragment } from '@/lib/api';

const FRAGMENT: SearchFragment = {
  parts: [
    { text: '… se hace el ', match: false },
    { text: 'cierre', match: true },
    { text: ' de ', match: false },
    { text: 'caja', match: true },
    { text: ' diario …', match: false },
  ],
  pageNumber: 4,
};

describe('MatchFragment (spec 004, R8, R11, F4)', () => {
  test('E1: las palabras encontradas van en <mark>; el resto, fuera', () => {
    const { container } = render(<MatchFragment fragment={FRAGMENT} />);

    const marks = [...container.querySelectorAll('mark')].map((mark) => mark.textContent);
    expect(marks).toEqual(['cierre', 'caja']);
    expect(container.textContent).toContain('… se hace el cierre de caja diario …');
  });

  test('E1: muestra "Página 4"', () => {
    render(<MatchFragment fragment={FRAGMENT} />);

    expect(screen.getByText('Página 4')).toBeInTheDocument();
  });

  test('sin página conocida no muestra "Página"', () => {
    render(<MatchFragment fragment={{ ...FRAGMENT, pageNumber: null }} />);

    expect(screen.queryByText(/Página/)).not.toBeInTheDocument();
  });

  test('E12: el HTML del documento se ve como texto y no crea elementos', () => {
    const { container } = render(
      <MatchFragment
        fragment={{
          parts: [
            { text: '<script>alert(1)</script> <b>negrita</b> ', match: false },
            { text: 'caja', match: true },
          ],
          pageNumber: null,
        }}
      />,
    );

    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('b')).toBeNull();
    expect(container.textContent).toContain('<script>alert(1)</script> <b>negrita</b> caja');
  });

  test('R11: el componente no usa dangerouslySetInnerHTML', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'components/documents/MatchFragment.tsx'),
      'utf8',
    );

    // Como atributo de JSX o como propiedad de un objeto; el comentario que lo prohíbe no cuenta.
    expect(source).not.toMatch(/dangerouslySetInnerHTML\s*[=:]/);
  });
});
