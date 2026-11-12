// HU25: el mensaje guarda el messageId que llega con done, y la valoración usa ese id.
// La primera pregunta de la conversación no se valora (ver lib/chat/feedback.ts), así que el test
// hace una primera pregunta y valora la segunda.
import { render, screen, waitFor } from '@testing-library/react';
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
const FEEDBACK_GROUP = { name: '¿Te sirvió esta respuesta?' };

describe('ChatPanel: valoración con el messageId de done (HU25)', () => {
    test('la respuesta valora el messageId que llegó con done', async () => {
        const user = userEvent.setup();
        render(<ChatPanel procedureVersionId="version-1" step={STEP} />);
        const box = screen.getByRole('textbox', { name: 'Tu pregunta' });

        // Primera pregunta: la respuesta no se valora.
        await user.type(box, '¿Cuántas veces cuento?');
        await user.click(screen.getByRole('button', { name: /Preguntar/ }));
        await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
        streams[0].send('start', { conversationId: 'conv-1' });
        streams[0].send('done', doneOf({ messageId: 'msg-41' }));
        streams[0].close();
        await waitFor(() => expect(box).toBeEnabled());
        expect(screen.queryByRole('group', FEEDBACK_GROUP)).not.toBeInTheDocument();

        // Segunda pregunta: esta sí se valora, con su propio messageId.
        await user.type(box, '¿Y si el cliente paga al contado?');
        await user.click(screen.getByRole('button', { name: /Preguntar/ }));
        await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
        streams[1].send('start', { conversationId: 'conv-1' });
        streams[1].send('done', doneOf({ messageId: 'msg-42' }));
        streams[1].close();

        expect(await screen.findByRole('group', FEEDBACK_GROUP)).toBeInTheDocument();

        // La siguiente llamada es la valoración: la respuesta a ese pedido es un 204.
        fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
        await user.click(screen.getByRole('button', { name: 'Sí' }));

        await waitFor(() =>
            expect(fetchMock).toHaveBeenLastCalledWith('/api/chat/messages/msg-42/feedback', expect.anything()),
        );
    });
});