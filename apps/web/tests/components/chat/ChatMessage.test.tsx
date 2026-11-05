// Spec 011 (T10, F2): la respuesta conflict muestra el aviso, la explicación con sus citas y las dos
// fuentes. no_info sigue en su caja punteada.
import { render, screen, within } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { ChatMessage } from '@/components/chat/ChatMessage';
import type { AssistantMessage } from '@/components/chat/chat-state';

const MANUAL = {
  documentId: 'doc-compras',
  documentTitle: 'Manual de compras',
  versionNumber: 2,
  section: 'Aprobaciones',
  chunkId: 'c1',
  validFrom: '2026-10-01',
  url: '',
};
const POLITICA = {
  documentId: 'doc-gastos',
  documentTitle: 'Política de gastos',
  versionNumber: 1,
  section: 'Sin sección',
  chunkId: 'c3',
  validFrom: '2026-10-01',
  url: '',
};

function assistant(overrides: Partial<AssistantMessage>): AssistantMessage {
  return {
    id: 2,
    role: 'assistant',
    question: '¿Quién aprueba una compra de $800.000?',
    status: 'conflict',
    text: 'El manual dice que la aprueba el gerente [S1]; la política, que el director [S3].',
    sources: [MANUAL, POLITICA],
    ...overrides,
  };
}

const renderMessage = (message: AssistantMessage) =>
  render(
    <ul>
      <ChatMessage message={message} onRetry={vi.fn()} busy={false} />
    </ul>,
  );

describe('ChatMessage: dos documentos que se contradicen (spec 011)', () => {
  test('E2: el aviso, con el título y el texto, no solo el color', () => {
    renderMessage(assistant({}));

    expect(screen.getByText('Dos documentos dicen cosas distintas')).toBeInTheDocument();
    expect(
      screen.getByText('Revisá las dos fuentes antes de seguir. Le avisamos al administrador para que lo revise.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  });

  test('E2: la explicación lleva las citas 1 y 2, que abren cada documento', () => {
    renderMessage(assistant({}));

    expect(screen.getByRole('link', { name: 'Fuente 1: Manual de compras' })).toHaveAttribute(
      'href',
      '/documentos/doc-compras',
    );
    expect(screen.getByRole('link', { name: 'Fuente 2: Política de gastos' })).toHaveAttribute(
      'href',
      '/documentos/doc-gastos',
    );
    expect(screen.getAllByRole('listitem')[0]).not.toHaveTextContent('[S1]');
  });

  test('E2: "Las dos fuentes", con un botón por documento', () => {
    renderMessage(assistant({}));

    const sources = screen.getByRole('list', { name: 'Las dos fuentes' });
    const links = within(sources).getAllByRole('link');
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveTextContent('1 Manual de compras · v2 · Aprobaciones');
    expect(links[1]).toHaveTextContent('2 Política de gastos · v1 · Sin sección');
  });

  test('no_info sigue en la caja punteada, sin aviso ni fuentes', () => {
    renderMessage(assistant({ status: 'no_info', text: 'No encontré información suficiente.', sources: [] }));

    expect(screen.getByText('No encontré información suficiente.').closest('.border-dashed')).not.toBeNull();
    expect(screen.queryByText('Dos documentos dicen cosas distintas')).not.toBeInTheDocument();
    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });
});
