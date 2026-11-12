// La pantalla vacía ofrece ejemplos que llenan el compositor sin enviarlos.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { ChatEmpty, EXAMPLE_QUESTIONS } from '@/components/chat/ChatEmpty';

describe('ChatEmpty: ejemplos de preguntas', () => {
    test('muestra el texto de siempre y un ejemplo por cada pregunta sugerida', () => {
        render(<ChatEmpty onPick={vi.fn()} />);

        expect(screen.getByText('Preguntá sobre los documentos vigentes de tus áreas.')).toBeInTheDocument();
        for (const question of EXAMPLE_QUESTIONS) {
            expect(screen.getByRole('button', { name: question })).toBeInTheDocument();
        }
    });

    test('tocar un ejemplo lo pasa a onPick, una sola vez', async () => {
        const onPick = vi.fn();
        render(<ChatEmpty onPick={onPick} />);

        await userEvent.click(screen.getByRole('button', { name: EXAMPLE_QUESTIONS[0] }));

        expect(onPick).toHaveBeenCalledTimes(1);
        expect(onPick).toHaveBeenCalledWith(EXAMPLE_QUESTIONS[0]);
    });
});