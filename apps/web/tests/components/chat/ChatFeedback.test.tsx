// HU25: la valoración de una respuesta, con el cliente HTTP real y fetch simulado.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { ChatFeedback } from '@/components/chat/ChatFeedback';

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
    fetchMock.mockImplementation(async () => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
});

const urlOf = (call: number) => fetchMock.mock.calls[call][0];
const bodyOf = (call: number) => JSON.parse(fetchMock.mock.calls[call][1]?.body as string) as Record<string, unknown>;

describe('ChatFeedback (HU25)', () => {
    test('es un selector Sí / No con el nombre de la pregunta, y no manda nada hasta elegir', () => {
        render(<ChatFeedback messageId="msg-1" />);

        const group = screen.getByRole('group', { name: '¿Te sirvió esta respuesta?' });
        expect(group).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Sí' })).toHaveAttribute('aria-pressed', 'false');
        expect(screen.getByRole('button', { name: 'No' })).toHaveAttribute('aria-pressed', 'false');
        expect(fetchMock).not.toHaveBeenCalled();
    });

    test('"Sí" manda useful: true al mensaje y deja el agradecimiento', async () => {
        const user = userEvent.setup();
        render(<ChatFeedback messageId="msg-1" />);

        await user.click(screen.getByRole('button', { name: 'Sí' }));

        expect(await screen.findByText('Gracias, tu valoración quedó guardada.')).toBeInTheDocument();
        expect(urlOf(0)).toBe('/api/chat/messages/msg-1/feedback');
        expect(bodyOf(0)).toEqual({ useful: true });
        expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });

    test('"No" abre el comentario y lo manda sin espacios de más', async () => {
        const user = userEvent.setup();
        render(<ChatFeedback messageId="msg-1" />);

        await user.click(screen.getByRole('button', { name: 'No' }));
        expect(screen.getByRole('button', { name: 'No' })).toHaveAttribute('aria-pressed', 'true');
        await user.type(screen.getByRole('textbox', { name: 'Contanos qué faltó (opcional)' }), '  Falta el monto  ');
        expect(screen.getByText(/\d+ de 500 caracteres/)).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'Enviar valoración' }));

        expect(await screen.findByText('Gracias, tu valoración quedó guardada.')).toBeInTheDocument();
        expect(bodyOf(0)).toEqual({ useful: false, comment: 'Falta el monto' });
    });

    test('"No" sin comentario no manda el campo comment', async () => {
        const user = userEvent.setup();
        render(<ChatFeedback messageId="msg-1" />);

        await user.click(screen.getByRole('button', { name: 'No' }));
        await user.click(screen.getByRole('button', { name: 'Enviar valoración' }));

        await screen.findByText('Gracias, tu valoración quedó guardada.');
        expect(bodyOf(0)).toEqual({ useful: false });
    });

    test('mientras se envía, las opciones están bloqueadas y se dice', async () => {
        const user = userEvent.setup();
        fetchMock.mockImplementationOnce(() => new Promise<Response>(() => { }));
        render(<ChatFeedback messageId="msg-1" />);

        await user.click(screen.getByRole('button', { name: 'Sí' }));

        expect(await screen.findByText('Enviando…')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Sí' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'No' })).toBeDisabled();
    });

    test('si falla, dice qué pasó, las opciones siguen activas y se puede reintentar', async () => {
        const user = userEvent.setup();
        fetchMock.mockResolvedValueOnce(
            new Response(JSON.stringify({ statusCode: 500, message: 'Error interno' }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' },
            }),
        );
        render(<ChatFeedback messageId="msg-1" />);

        await user.click(screen.getByRole('button', { name: 'Sí' }));

        expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos guardar tu valoración. Probá de nuevo.');
        expect(screen.getByRole('button', { name: 'Sí' })).toBeEnabled();

        await user.click(screen.getByRole('button', { name: 'Sí' }));

        expect(await screen.findByText('Gracias, tu valoración quedó guardada.')).toBeInTheDocument();
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });
});