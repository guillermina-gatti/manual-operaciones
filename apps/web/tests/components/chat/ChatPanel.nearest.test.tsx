// HU19: los documentos cercanos que llegan con done se muestran bajo la respuesta "no encontré".
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

describe('ChatPanel: documentos cercanos con done (HU19)', () => {
    test('con no_info, muestra los documentos cercanos que llegaron', async () => {
        const user = userEvent.setup();
        render(<ChatPanel procedureVersionId="version-1" step={STEP} />);

        await user.type(screen.getByRole('textbox', { name: 'Tu pregunta' }), '¿Cuántas veces cuento?');
        await user.click(screen.getByRole('button', { name: /Preguntar/ }));
        await waitFor(() => expect(fetchMock).toHaveBeenCalled());
        streams[0].send('start', { conversationId: 'conv-1' });
        streams[0].send(
            'done',
            doneOf({
                status: 'no_info',
                answer: 'No encontré información suficiente.',
                sources: [],
                nearestDocuments: [{ documentId: 'doc-compras', documentTitle: 'Manual de compras' }],
            }),
        );
        streams[0].close();

        const link = await screen.findByRole('link', { name: 'Manual de compras' });
        expect(link).toHaveAttribute('href', '/documentos/doc-compras');
    });
});