// HU25: el mensaje guarda el messageId que llega con done, y la valoración usa ese id.
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

describe('ChatPanel: valoración con el messageId de done (HU25)', () => {
    test('la respuesta valora el messageId que llegó con done', async () => {
        const user = userEvent.setup();
        render(<ChatPanel procedureVersionId="version-1" step={STEP} />);

        await user.type(screen.getByRole('textbox', { name: 'Tu pregunta' }), '¿Cuántas veces cuento?');
        await user.click(screen.getByRole('button', { name: /Preguntar/ }));
        await waitFor(() => expect(fetchMock).toHaveBeenCalled());
        streams[0].send('start', { conversationId: 'conv-1' });
        streams[0].send('done', doneOf({ messageId: 'msg-42' }));
        streams[0].close();

        expect(await screen.findByRole('group', { name: '¿Te sirvió esta respuesta?' })).toBeInTheDocument();

        // La siguiente llamada es la valoración: la respuesta a ese pedido es un 204.
        fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
        await user.click(screen.getByRole('button', { name: 'Sí' }));

        await waitFor(() =>
            expect(fetchMock).toHaveBeenLastCalledWith('/api/chat/messages/msg-42/feedback', expect.anything()),
        );
    });
});