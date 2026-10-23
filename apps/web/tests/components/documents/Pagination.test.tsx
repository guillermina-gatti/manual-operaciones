import { render, screen, within } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { Pagination } from '@/components/documents/Pagination';

const pageLinks = () =>
  within(screen.getByRole('navigation', { name: 'Páginas' }))
    .getAllByRole('link')
    .filter((link) => link.getAttribute('aria-label')?.startsWith('Página'));

describe('Pagination (F7, P6)', () => {
  test('con 45 documentos de a 20 hay 3 páginas', () => {
    render(<Pagination currentPage={1} totalItems={45} pageSize={20} />);

    expect(pageLinks().map((link) => link.textContent)).toEqual(['1', '2', '3']);
  });

  test('los enlaces apuntan a ?pagina=N; la página 1 a /documentos', () => {
    render(<Pagination currentPage={2} totalItems={45} pageSize={20} />);

    expect(pageLinks().map((link) => link.getAttribute('href'))).toEqual([
      '/documentos',
      '/documentos?pagina=2',
      '/documentos?pagina=3',
    ]);
  });

  test('la página actual tiene aria-current="page" y las demás no', () => {
    render(<Pagination currentPage={2} totalItems={45} pageSize={20} />);

    expect(screen.getByRole('link', { name: 'Página 2' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Página 1' })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('link', { name: 'Página 3' })).not.toHaveAttribute('aria-current');
  });

  test('en la primera página no está "Anterior"', () => {
    render(<Pagination currentPage={1} totalItems={45} pageSize={20} />);

    expect(screen.queryByRole('link', { name: 'Anterior' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Siguiente' })).toHaveAttribute(
      'href',
      '/documentos?pagina=2',
    );
  });

  test('en la última página no está "Siguiente"', () => {
    render(<Pagination currentPage={3} totalItems={45} pageSize={20} />);

    expect(screen.queryByRole('link', { name: 'Siguiente' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Anterior' })).toHaveAttribute(
      'href',
      '/documentos?pagina=2',
    );
  });

  test('"Anterior" desde la página 2 lleva a /documentos', () => {
    render(<Pagination currentPage={2} totalItems={45} pageSize={20} />);

    expect(screen.getByRole('link', { name: 'Anterior' })).toHaveAttribute('href', '/documentos');
  });

  test('con muchas páginas muestra "…", oculto para lectores de pantalla', () => {
    render(<Pagination currentPage={6} totalItems={240} pageSize={20} />);

    expect(pageLinks().map((link) => link.textContent)).toEqual(['1', '5', '6', '7', '12']);
    const ellipses = screen.getAllByText('…');
    expect(ellipses).toHaveLength(2);
    for (const ellipsis of ellipses) expect(ellipsis).toHaveAttribute('aria-hidden', 'true');
  });

  test.each([0, 1, 20])('con %i documentos no se renderiza', (totalItems) => {
    const { container } = render(
      <Pagination currentPage={1} totalItems={totalItems} pageSize={20} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  test('con 21 documentos sí se renderiza', () => {
    render(<Pagination currentPage={1} totalItems={21} pageSize={20} />);

    expect(pageLinks()).toHaveLength(2);
  });
});
