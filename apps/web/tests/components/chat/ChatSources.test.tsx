// Spec 011 (T10, PD9): el título opcional de las fuentes. Sin él, igual que en la spec 009.
// HU18: cada fuente dice desde cuándo está vigente.
import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { ChatSources } from '@/components/chat/ChatSources';

const SOURCE = {
  documentId: 'doc-1',
  documentTitle: 'Manual de compras',
  versionNumber: 2,
  section: 'Aprobaciones',
  chunkId: 'chunk-1',
  validFrom: '2026-10-01',
  url: '',
};

describe('ChatSources', () => {
  test('sin título, la lista se llama "Fuentes" y no hay texto antes', () => {
    const { container } = render(<ChatSources sources={[SOURCE]} />);

    expect(screen.getByRole('list', { name: 'Fuentes' })).toBeInTheDocument();
    expect(container.querySelector('p')).toBeNull();
  });

  test('con título, el texto antes de la lista y la lista con ese nombre', () => {
    render(<ChatSources sources={[SOURCE]} title="Las dos fuentes" />);

    expect(screen.getByText('Las dos fuentes', { selector: 'p' })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Las dos fuentes' })).toBeInTheDocument();
  });

  test('sin fuentes, nada', () => {
    const { container } = render(<ChatSources sources={[]} title="Las dos fuentes" />);

    expect(container).toBeEmptyDOMElement();
  });

  test('HU18: cada fuente dice desde cuándo está vigente', () => {
    render(<ChatSources sources={[SOURCE]} />);

    expect(screen.getByText('Vigente desde 01/10/2026')).toBeInTheDocument();
  });
});