// La ruta de Documentos (plan 002, D9): "Documentos" vuelve a la vista con la que se entró (?vista=), y
// la pantalla actual va al final, con aria-current. Reemplaza a "Volver a Documentos".
import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { Breadcrumb, DocumentsBreadcrumb } from '@/components/documents/DocumentsBreadcrumb';

const mocks = vi.hoisted(() => ({ searchParams: new URLSearchParams() }));

vi.mock('next/navigation', () => ({
  useSearchParams: () => mocks.searchParams,
}));

beforeEach(() => {
  mocks.searchParams = new URLSearchParams();
});

const nav = () => screen.getByRole('navigation', { name: 'Ruta' });
const documentsLink = () => within(nav()).getByRole('link', { name: 'Documentos' });

describe('DocumentsBreadcrumb', () => {
  test.each([
    ['', '/documentos'],
    ['vista=tarjetas', '/documentos?vista=tarjetas'],
    ['vista=lista', '/documentos'],
    ['vista=xyz', '/documentos'],
  ])('?%s → "Documentos" lleva a %s', (query, href) => {
    mocks.searchParams = new URLSearchParams(query);
    render(<DocumentsBreadcrumb current="Cargar documento" />);

    expect(documentsLink()).toHaveAttribute('href', href);
  });

  test('la pantalla actual va al final, con aria-current y sin enlace', () => {
    render(<DocumentsBreadcrumb current="Cargar documento" />);

    const items = within(nav()).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    const current = within(items[1]).getByText('Cargar documento');
    expect(current).toHaveAttribute('aria-current', 'page');
    expect(within(items[1]).queryByRole('link')).not.toBeInTheDocument();
    expect(documentsLink()).not.toHaveAttribute('aria-current');
  });

  test('el separador "›" es decorativo', () => {
    render(<DocumentsBreadcrumb current="Cargar documento" />);

    expect(within(nav()).getByText('›')).toHaveAttribute('aria-hidden', 'true');
  });

  test('un título largo se recorta y queda completo en title', () => {
    const long = 'Procedimiento de cierre de caja '.repeat(6).trim();
    render(<DocumentsBreadcrumb current={long} />);

    const current = within(nav()).getByText(long);
    expect(current).toHaveClass('truncate');
    expect(current).toHaveAttribute('title', long);
  });
});

describe('Breadcrumb', () => {
  test('sin current, solo "Documentos" (mientras carga o si falla)', () => {
    render(<Breadcrumb href="/documentos" />);

    expect(within(nav()).getAllByRole('listitem')).toHaveLength(1);
    expect(documentsLink()).toHaveAttribute('href', '/documentos');
    expect(nav().querySelector('[aria-current]')).toBeNull();
  });
});
