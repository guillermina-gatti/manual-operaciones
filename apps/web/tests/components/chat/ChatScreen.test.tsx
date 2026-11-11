// Spec 009 (T12): la pantalla del asistente, con la respuesta que aparece de a partes.
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { ChatScreen } from '@/components/chat/ChatScreen';
import { FIXTURE_USERS } from '@/lib/directory/fixtures';
import type { SessionState } from '@/lib/session';
import { controlledStream, doneOf, type ControlledStream } from '../../support/chat';

const mocks = vi.hoisted(() => ({ useSession: vi.fn() }));

vi.mock('@/lib/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/session')>()),
  useSession: mocks.useSession,
}));

const fetchMock = vi.fn<typeof fetch>();
let streams: ControlledStream[];

const session: SessionState = {
  user: {
    id: FIXTURE_USERS.empleadoVentas.id,
    name: FIXTURE_USERS.empleadoVentas.name,
    role: FIXTURE_USERS.empleadoVentas.role,
  },
  status: 'ready',
};

beforeEach(() => {
  mocks.useSession.mockReturnValue(session);
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

const question = () => screen.getByRole('textbox', { name: 'Tu pregunta' });
const askButton = () => screen.getByRole('button', { name: /Preguntar/ });
const bodyOf = (call: number) => JSON.parse(fetchMock.mock.calls[call][1]?.body as string) as Record<string, unknown>;

async function ask(user: ReturnType<typeof userEvent.setup>, text: string) {
  await user.type(question(), text);
  await user.click(askButton());
  await waitFor(() => expect(streams).toHaveLength(fetchMock.mock.calls.length));
  return streams.at(-1)!;
}

describe('ChatScreen (spec 009, T12)', () => {
  test('la cabecera del asistente, con su alcance', () => {
    render(<ChatScreen />);

    expect(screen.getByRole('heading', { level: 1, name: 'El hornero' })).toBeInTheDocument();
    expect(screen.getByText('Responde solo con lo vigente de tus áreas y cita la fuente')).toBeInTheDocument();
  });

  test('E1: la pregunta aparece y el texto de la respuesta crece antes de terminar', async () => {
    const user = userEvent.setup();
    render(<ChatScreen />);

    const stream = await ask(user, '¿Cuál es el plazo?');
    expect(screen.getByText('¿Cuál es el plazo?')).toBeInTheDocument();

    act(() => {
      stream.send('start', { conversationId: 'conv-1' });
      stream.send('delta', { text: 'El plazo ' });
    });
    expect(await screen.findByText('El plazo')).toBeInTheDocument();

    act(() => stream.send('delta', { text: 'es de 5 días [S1].' }));
    expect(await screen.findByText('El plazo es de 5 días [S1].')).toBeInTheDocument();

    act(() => {
      stream.send('done', doneOf());
      stream.close();
    });
    await waitFor(() => expect(askButton()).toHaveAttribute('aria-busy', 'false'));
  });

  test('E17: mientras llega la respuesta la burbuja está ocupada y no se anuncia; al terminar, sí', async () => {
    const user = userEvent.setup();
    render(<ChatScreen />);

    const stream = await ask(user, '¿Cuál es el plazo?');
    act(() => stream.send('delta', { text: 'El plazo es de 5 días' }));

    const busy = await screen.findByText('El plazo es de 5 días');
    expect(busy.closest('[aria-busy="true"]')).not.toBeNull();
    const live = screen.getByTestId('chat-live');
    expect(live).toHaveAttribute('aria-live', 'polite');
    expect(live).toBeEmptyDOMElement();

    act(() => {
      stream.send('done', doneOf({ answer: 'El plazo es de 5 días.', sources: [] }));
      stream.close();
    });

    await waitFor(() => expect(live).toHaveTextContent('El plazo es de 5 días.'));
    expect(document.querySelector('[aria-busy="true"]')).toBeNull();
  });

  test('E14: la segunda pregunta lleva el conversationId; con "Nueva conversación", no', async () => {
    const user = userEvent.setup();
    render(<ChatScreen />);

    const first = await ask(user, 'Primera');
    act(() => {
      first.send('start', { conversationId: 'conv-1' });
      first.send('done', doneOf({ sources: [], answer: 'Uno.' }));
      first.close();
    });
    await waitFor(() => expect(askButton()).toHaveAttribute('aria-busy', 'false'));
    expect(bodyOf(0)).toEqual({ message: 'Primera' });

    const second = await ask(user, 'Segunda');
    act(() => {
      second.send('done', doneOf({ sources: [], answer: 'Dos.' }));
      second.close();
    });
    await waitFor(() => expect(askButton()).toHaveAttribute('aria-busy', 'false'));
    expect(bodyOf(1)).toEqual({ message: 'Segunda', conversationId: 'conv-1' });

    await user.click(screen.getByRole('button', { name: 'Nueva conversación' }));
    expect(screen.queryByText('Primera')).not.toBeInTheDocument();
    await ask(user, 'Tercera');
    expect(bodyOf(2)).toEqual({ message: 'Tercera' });
  });

  test('E11: al salir de la pantalla se corta el pedido', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<ChatScreen />);

    await ask(user, '¿Cuál es el plazo?');
    const signal = fetchMock.mock.calls[0][1]?.signal as AbortSignal;
    expect(signal.aborted).toBe(false);

    unmount();

    expect(signal.aborted).toBe(true);
  });

  test('Enter envía, Shift+Enter agrega una línea, y vacío no envía', async () => {
    const user = userEvent.setup();
    render(<ChatScreen />);

    await user.click(askButton());
    await user.type(question(), '   ');
    await user.keyboard('{Enter}');
    expect(fetchMock).not.toHaveBeenCalled();

    await user.clear(question());
    await user.type(question(), 'Línea uno{Shift>}{Enter}{/Shift}línea dos');
    expect(question()).toHaveValue('Línea uno\nlínea dos');
    expect(fetchMock).not.toHaveBeenCalled();

    await user.keyboard('{Enter}');
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(bodyOf(0)).toEqual({ message: 'Línea uno\nlínea dos' });
    expect(question()).toHaveValue('');
  });

  test('mientras llega una respuesta el botón está deshabilitado, y se puede escribir la próxima', async () => {
    const user = userEvent.setup();
    render(<ChatScreen />);

    const stream = await ask(user, 'Primera');
    expect(askButton()).toBeDisabled();
    await user.type(question(), 'Próxima');
    expect(question()).toHaveValue('Próxima');

    act(() => {
      stream.send('done', doneOf({ sources: [], answer: 'Listo.' }));
      stream.close();
    });
    await waitFor(() => expect(askButton()).toBeEnabled());
  });

  test('el contador muestra los caracteres sobre 2.000', async () => {
    const user = userEvent.setup();
    render(<ChatScreen />);

    await user.type(question(), 'Hola');

    expect(screen.getByText('4/2000')).toBeInTheDocument();
    expect(question()).toHaveAttribute('maxLength', '2000');
  });

  test('sin sesión no muestra el chat', () => {
    mocks.useSession.mockReturnValue({ user: null, status: 'ready' });
    render(<ChatScreen />);

    expect(screen.queryByRole('textbox', { name: 'Tu pregunta' })).not.toBeInTheDocument();
    expect(within(document.body).getByText(/iniciar sesión|usuario de prueba/i)).toBeInTheDocument();
  });
});
