// "Volver a Documentos" del detalle: vuelve a la vista con la que se entró (?vista=).
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { BackToDocuments } from '@/components/documents/BackToDocuments';

const mocks = vi.hoisted(() => ({ searchParams: new URLSearchParams() }));

vi.mock('next/navigation', () => ({
  useSearchParams: () => mocks.searchParams,
}));

beforeEach(() => {
  mocks.searchParams = new URLSearchParams();
});

const backLink = () => screen.getByRole('link', { name: 'Volver a Documentos' });

describe('BackToDocuments', () => {
  test.each([
    ['', '/documentos'],
    ['vista=tarjetas', '/documentos?vista=tarjetas'],
    ['vista=lista', '/documentos'],
    ['vista=xyz', '/documentos'],
  ])('?%s → %s', (query, href) => {
    mocks.searchParams = new URLSearchParams(query);
    render(<BackToDocuments />);

    expect(backLink()).toHaveAttribute('href', href);
  });
});
