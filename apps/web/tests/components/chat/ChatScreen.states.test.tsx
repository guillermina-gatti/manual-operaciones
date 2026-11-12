// Spec 009 (T13): fuentes, citas y estados de la respuesta (F4, F5), con el respaldo de la búsqueda.
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { ChatScreen } from '@/components/chat/ChatScreen';
import { FIXTURE_USERS } from '@/lib/directory/fixtures';
import { controlledStream, doneOf, type ControlledStream } from '../../support/chat';

const mocks = vi.hoisted(() => ({ useSession: vi.fn() }));

vi.mock('@/lib/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/session')>()),
  useSession: mocks.useSession,
}));

const fetchMock = vi.fn<typeof fetch>();
let streams: ControlledStream[];

beforeEach(() => {
  mocks.useSession.mockReturnValue({
    user: {
      id: FIXTURE_USERS.empleadoVentas.id,
      name: FIXTURE_USERS.empleadoVentas.name,
      role: FIXTURE_USERS.empleadoVentas.role,
    },
    status: 'ready',
  });
  streams = [];
  fetchMock.mockImplementation(async () => {
    const stream = controlledStream();
    streams.push(stream);
    return stream.response;
  });
  vi.stubGlobal('fetch', fetchMock);
  render(<ChatScreen />);
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

const question = () => screen.getByRole('textbox', { name: 'Tu pregunta' });
const conversation = () => screen.getByRole('list', { name: 'Conversación' });
const bodyOf = (call: number) => JSON.parse(fetchMock.mock.calls[call][1]?.body as string) as Record<string, unknown>;
const idle = () =>
  waitFor(() => expect(screen.getByRole('button', { name: /Preguntar/ })).toHaveAttribute('aria-busy', 'false'));

async function ask(text: string) {
  const user = userEvent.setup();
  await user.type(question(), text);
  await user.keyboard('{Enter}');
  await waitFor(() => expect(streams).toHaveLength(fetchMock.mock.calls.length));
  return { user, stream: streams.at(-1)! };
}

function finish(stream: ControlledStream, events: Array<[string, unknown]>) {
  act(() => {
    for (const [event, data] of events) stream.send(event, data);
    stream.close();
  });
}

const SOURCE_B = {
  documentId: 'doc-2',
  documentTitle: 'Plazos de entrega',
  versionNumber: 1,
  section: 'Sin sección',
  chunkId: 'chunk-2',
  validFrom: '2026-10-01',
  url: '',
};

describe('ChatScreen: fuentes, citas y estados (spec 009, T13)', () => {
  test('answered: la cita 1 y el botón de la fuente abren el detalle del documento', async () => {
    const { stream } = await ask('¿Cuál es el plazo?');
    finish(stream, [['done', doneOf()]]);
    await idle();

    const cite = await screen.findByRole('link', { name: 'Fuente 1: Manual de compras' });
    expect(cite).toHaveAttribute('href', '/documentos/doc-1');
    expect(cite).toHaveTextContent('1');
    const source = screen.getByRole('link', { name: /1 Manual de compras · v2 · Aprobaciones/ });
    expect(source).toHaveAttribute('href', '/documentos/doc-1');
    expect(conversation()).not.toHaveTextContent('[S1]');
  });

  test('E15: [S2] y [S5] son las citas 1 y 2, en el orden de las fuentes', async () => {
    const { stream } = await ask('¿Plazo y monto?');
    finish(stream, [
      ['done', doneOf({ answer: 'El monto [S5] y el plazo [S2].', sources: [doneOf().sources[0], SOURCE_B] })],
    ]);
    await idle();

    expect(await screen.findByRole('link', { name: 'Fuente 1: Manual de compras' })).toBeInTheDocument();
    const second = screen.getByRole('link', { name: 'Fuente 2: Plazos de entrega' });
    expect(second).toHaveAttribute('href', '/documentos/doc-2');
    expect(screen.getByRole('link', { name: /2 Plazos de entrega · v1 · Sin sección/ })).toBeInTheDocument();
  });

  test('si las marcas no coinciden con las fuentes, el texto va sin citas y las fuentes debajo', async () => {
    const { stream } = await ask('¿Plazo?');
    finish(stream, [['done', doneOf({ answer: 'Ver [S1] y [S9].' })]]);
    await idle();

    expect(await within(conversation()).findByText('Ver y.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^Fuente 1/ })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /1 Manual de compras/ })).toBeInTheDocument();
  });

  test('E5: no_info en una caja punteada, sin fuentes', async () => {
    const { stream } = await ask('Algo fuera de tema');
    finish(stream, [
      ['done', doneOf({ status: 'no_info', answer: 'No encontré información suficiente.', sources: [] })],
    ]);
    await idle();

    const box = await within(conversation()).findByText('No encontré información suficiente.');
    expect(box.closest('.border-dashed')).not.toBeNull();
    expect(within(conversation()).queryAllByRole('link')).toHaveLength(0);
  });

  test('E7: ai_unavailable con el enlace a la búsqueda que manda la API', async () => {
    const { stream } = await ask('¿Cómo cierro la caja?');
    finish(stream, [
      [
        'done',
        doneOf({
          status: 'ai_unavailable',
          answer: 'El asistente no está disponible en este momento. Podés buscar directamente en los documentos.',
          sources: [],
          searchUrl: '/documentos?q=%C2%BFC%C3%B3mo%20cierro%20la%20caja%3F',
        }),
      ],
    ]);
    await idle();

    const link = await screen.findByRole('link', { name: 'Buscar «¿Cómo cierro la caja?» en los documentos' });
    expect(link).toHaveAttribute('href', '/documentos?q=%C2%BFC%C3%B3mo%20cierro%20la%20caja%3F');
  });

  test('E9: con dos partes y después ai_unavailable, el texto parcial desaparece', async () => {
    const { stream } = await ask('¿Plazo?');
    act(() => {
      stream.send('delta', { text: 'El plazo ' });
      stream.send('delta', { text: 'es de' });
    });
    expect(await within(conversation()).findByText('El plazo es de')).toBeInTheDocument();

    finish(stream, [
      ['done', doneOf({ status: 'ai_unavailable', answer: 'El asistente no está disponible.', sources: [], searchUrl: '/documentos?q=%C2%BFPlazo%3F' })],
    ]);
    await idle();

    expect(within(conversation()).queryByText('El plazo es de')).not.toBeInTheDocument();
    expect(within(conversation()).getByText('El asistente no está disponible.')).toBeInTheDocument();
  });

  test('E10: un corte muestra el aviso, el enlace armado por la web y "Volver a preguntar"', async () => {
    const { user, stream } = await ask('¿Cuál es el plazo de entrega?');
    act(() => stream.send('delta', { text: 'El plazo ' }));
    await within(conversation()).findByText('El plazo');
    act(() => stream.close());
    await idle();

    expect(within(conversation()).queryByText('El plazo')).not.toBeInTheDocument();
    expect(within(conversation()).getByText('Se cortó la respuesta.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Buscar «¿Cuál es el plazo de entrega?» en los documentos' })).toHaveAttribute(
      'href',
      `/documentos?q=${encodeURIComponent('¿Cuál es el plazo de entrega?')}`,
    );

    await user.click(screen.getByRole('button', { name: 'Volver a preguntar' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(bodyOf(1)).toMatchObject({ message: '¿Cuál es el plazo de entrega?' });
  });

  test('el evento error muestra "El asistente no pudo responder." con el enlace', async () => {
    const { stream } = await ask('¿Plazo?');
    finish(stream, [
      ['start', { conversationId: 'conv-1' }],
      ['error', { statusCode: 503, message: 'caído' }],
    ]);
    await idle();

    expect(within(conversation()).getByText('El asistente no pudo responder.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Buscar «¿Plazo\?» en los documentos/ })).toBeInTheDocument();
  });

  test('una pregunta muy corta ofrece la búsqueda sin texto', async () => {
    const { stream } = await ask('ok');
    act(() => stream.close());
    await idle();

    expect(screen.getByRole('link', { name: 'Buscar en los documentos' })).toHaveAttribute('href', '/documentos');
  });

  test('un 404 de la conversación muestra el aviso y la próxima pregunta empieza otra', async () => {
    const { stream } = await ask('Primera');
    finish(stream, [
      ['start', { conversationId: 'conv-1' }],
      ['done', doneOf({ sources: [], answer: 'Uno.' })],
    ]);
    await idle();

    fetchMock.mockImplementationOnce(
      async () =>
        new Response(JSON.stringify({ statusCode: 404, message: 'Conversación no encontrada' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    const user = userEvent.setup();
    await user.type(question(), 'Segunda');
    await user.keyboard('{Enter}');
    expect(await within(conversation()).findByText(/Esta conversación ya no está disponible/)).toBeInTheDocument();
    expect(bodyOf(1)).toEqual({ message: 'Segunda', conversationId: 'conv-1' });
    await idle();

    await user.type(question(), 'Tercera');
    await user.keyboard('{Enter}');
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(bodyOf(2)).toEqual({ message: 'Tercera' });
  });
});

// Spec 011 (T10, F1, F3): con conflict, la pantalla guarda las dos fuentes y anuncia el aviso.
describe('ChatScreen: dos documentos que se contradicen (spec 011)', () => {
  const POLITICA = { ...SOURCE_B, documentId: 'doc-gastos', documentTitle: 'Política de gastos', chunkId: 'c3' };

  test('E2: el aviso, la explicación con sus citas y las dos fuentes, y el anuncio', async () => {
    const { stream } = await ask('¿Quién aprueba una compra de $800.000?');
    finish(stream, [
      [
        'done',
        doneOf({
          status: 'conflict',
          answer: 'El manual dice gerente [S1]; la política, director [S3].',
          sources: [doneOf().sources[0], POLITICA],
        }),
      ],
    ]);
    await idle();

    expect(await within(conversation()).findByText('Dos documentos dicen cosas distintas')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Fuente 2: Política de gastos' })).toBeInTheDocument();
    expect(within(screen.getByRole('list', { name: 'Las dos fuentes' })).getAllByRole('link')).toHaveLength(2);
    expect(screen.getByTestId('chat-live')).toHaveTextContent(
      'Dos documentos dicen cosas distintas. El manual dice gerente; la política, director.',
    );
  });
});
