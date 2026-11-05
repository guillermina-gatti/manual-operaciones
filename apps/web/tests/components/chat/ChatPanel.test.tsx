// Spec 010 (T10): el panel del asistente para un paso de la ejecución.
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { ChatPanel } from '@/components/chat/ChatPanel';
import { controlledStream, doneOf, type ControlledStream } from '../../support/chat';

const fetchMock = vi.fn<typeof fetch>();
let streams: ControlledStream[];

beforeEach(() => {
  streams = [];
  fetchMock.mockImplementation(async () => {
    const stream = controlledStream();
    streams.push(stream);
    return stream.response;
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

const STEP = { stepId: 'step-2', order: 2, title: 'Contar el efectivo' };
const panel = () => render(<ChatPanel procedureVersionId="version-1" step={STEP} />);
const bodyOf = (call: number) => JSON.parse(fetchMock.mock.calls[call][1]?.body as string) as Record<string, unknown>;

async function ask(user: ReturnType<typeof userEvent.setup>, text: string) {
  await user.type(screen.getByRole('textbox', { name: 'Tu pregunta' }), text);
  await user.click(screen.getByRole('button', { name: /Preguntar/ }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalled());
}

describe('ChatPanel (spec 010, T10)', () => {
  test('E1: la cabecera dice "¿Dudas con este paso?" y el paso', () => {
    panel();

    expect(screen.getByRole('heading', { level: 2, name: '¿Dudas con este paso?' })).toBeInTheDocument();
    expect(screen.getByText('Paso 2 · Contar el efectivo')).toBeInTheDocument();
  });

  test('E1: cada pedido lleva el contexto del paso', async () => {
    const user = userEvent.setup();
    panel();

    await ask(user, '¿Cuántas veces cuento?');
    streams[0].send('start', { conversationId: 'conv-1' });
    streams[0].send('done', doneOf());
    streams[0].close();
    await screen.findByRole('link', { name: /Fuente 1/ });

    expect(bodyOf(0)).toEqual({
      message: '¿Cuántas veces cuento?',
      context: { procedureVersionId: 'version-1', stepId: 'step-2' },
    });
  });

  test('E13: un 404 del paso muestra el aviso con el enlace a la búsqueda, y se puede seguir escribiendo', async () => {
    fetchMock.mockImplementation(
      async () =>
        new Response(JSON.stringify({ statusCode: 404, message: 'El paso no está disponible' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    const user = userEvent.setup();
    panel();

    await ask(user, 'arqueo');

    const conversation = screen.getByRole('list', { name: 'Conversación' });
    expect(
      await within(conversation).findByText(
        'Este paso ya no está disponible para consultas. Podés buscar en los documentos sin el asistente.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Buscar «arqueo» en los documentos' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Tu pregunta' })).toBeEnabled();
  });

  test('F7: no suma otra región "Asistente"', () => {
    panel();

    expect(screen.queryByRole('region', { name: 'Asistente' })).not.toBeInTheDocument();
    expect(screen.queryByRole('complementary', { name: 'Asistente' })).not.toBeInTheDocument();
  });
});
