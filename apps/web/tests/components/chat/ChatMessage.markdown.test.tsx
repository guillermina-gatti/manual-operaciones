// Las respuestas del asistente con Markdown (listas, negritas, párrafos y subtítulos), sin perder las citas
// ni las rutas, también mientras llega la respuesta. Nada del modelo se interpreta como HTML.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { ChatMessage } from '@/components/chat/ChatMessage';
import type { AssistantMessage } from '@/components/chat/chat-state';

const source = (documentId: string, documentTitle: string, chunkId: string) => ({
  documentId,
  documentTitle,
  versionNumber: 1,
  section: 'Sin sección',
  chunkId,
  validFrom: '2026-10-01',
  url: '',
});
const POLITICA = source('doc-politica', 'Política de devoluciones', 'c1');
const PROMO = source('doc-promo', 'Promoción de verano', 'c3');

function assistant(overrides: Partial<AssistantMessage>): AssistantMessage {
  return {
    id: 2,
    role: 'assistant',
    question: '¿Se puede devolver ropa interior?',
    status: 'conflict',
    text: '* [S1] establece que la ropa interior **no** tiene devolución.\n* [S3] indica que cualquier producto se devuelve en 60 días.',
    sources: [POLITICA, PROMO],
    ...overrides,
  };
}

const renderMessage = (message: AssistantMessage) =>
  render(
    <ul>
      <ChatMessage message={message} onRetry={vi.fn()} busy={false} />
    </ul>,
  );

describe('ChatMessage: Markdown en la respuesta', () => {
  test('la explicación de una contradicción como lista, con las citas como enlaces y sin asteriscos', () => {
    const { container } = renderMessage(assistant({}));

    const list = container.querySelector('ul ul');
    expect(list).not.toBeNull();
    const items = within(list as HTMLElement).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(within(items[0]).getByRole('link', { name: 'Fuente 1: Política de devoluciones' })).toHaveAttribute(
      'href',
      '/documentos/doc-politica',
    );
    expect(within(items[1]).getByRole('link', { name: 'Fuente 2: Promoción de verano' })).toBeInTheDocument();
    expect(items[0].querySelector('strong')?.textContent).toBe('no');
    expect(list?.textContent).not.toContain('*');
  });

  test('una respuesta con párrafos, una lista numerada y un subtítulo chico', () => {
    const { container } = renderMessage(
      assistant({
        status: 'answered',
        text: '## Al firmar el remito\n\n1. Anotá los bultos que faltan [S1].\n2. Firmá con **Recibido con faltantes** [S3].\n\nDespués avisá al supervisor.',
      }),
    );

    expect(screen.getByRole('heading', { level: 3, name: 'Al firmar el remito' })).toBeInTheDocument();
    const ordered = container.querySelector('ol');
    expect(ordered).not.toBeNull();
    expect(within(ordered as HTMLElement).getAllByRole('listitem')).toHaveLength(2);
    expect(container.querySelector('strong')?.textContent).toBe('Recibido con faltantes');
    expect(screen.getByText('Después avisá al supervisor.')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /^Fuente \d/ })).toHaveLength(2);
  });

  test('las rutas siguen siendo enlaces dentro de una lista', () => {
    renderMessage(
      assistant({ status: 'answered', text: '* Entrá a /documentos para buscarlo [S1].', sources: [POLITICA] }),
    );

    expect(screen.getByRole('link', { name: '/documentos' })).toHaveAttribute('href', '/documentos');
    expect(screen.getByRole('link', { name: 'Fuente 1: Política de devoluciones' })).toBeInTheDocument();
  });

  test('mientras llega, la lista se dibuja con lo que llegó, la negrita sin cerrar queda como texto y las marcas tal cual', () => {
    const { container } = renderMessage(
      assistant({ status: 'streaming', text: '* [S1] establece que la ropa interior **no', sources: [] }),
    );

    const item = container.querySelector('ul ul li');
    expect(item?.textContent).toBe('[S1] establece que la ropa interior **no');
    expect(container.querySelector('strong')).toBeNull();
  });

  test('el HTML del modelo se ve como texto y no se ejecuta', () => {
    const { container } = renderMessage(
      assistant({ status: 'answered', text: '<b>Ojo</b> <script>alert(1)</script> [S1]', sources: [POLITICA] }),
    );

    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('b')).toBeNull();
    expect(screen.getByText(/<b>Ojo<\/b> <script>alert\(1\)<\/script>/)).toBeInTheDocument();
  });

  test.each([['components/chat/AnswerText.tsx'], ['components/chat/ChatMessage.tsx'], ['lib/chat/markdown.ts']])(
    '%s no usa dangerouslySetInnerHTML',
    (file) => {
      const code = readFileSync(resolve(process.cwd(), file), 'utf8');
      expect(code).not.toMatch(/dangerouslySetInnerHTML\s*[=:]/);
    },
  );
});
