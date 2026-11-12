// HU19: a quién consultar aparece solo cuando no hay información y la API lo sugiere.
import { render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { ChatMessage } from '@/components/chat/ChatMessage';
import type { AssistantMessage } from '@/components/chat/chat-state';

const CONTACT = { name: 'Laura Pérez', email: 'laura.perez@empresa.test' };

function assistant(overrides: Partial<AssistantMessage>): AssistantMessage {
    return {
        id: 2,
        role: 'assistant',
        question: '¿Cuál es el plazo?',
        status: 'no_info',
        text: 'No encontré información suficiente.',
        sources: [],
        messageId: 'msg-1',
        ...overrides,
    };
}

const renderMessage = (message: AssistantMessage) =>
    render(
        <ul>
            <ChatMessage message={message} onRetry={vi.fn()} busy={false} />
        </ul>,
    );

describe('ChatMessage: a quién consultar (HU19)', () => {
    test('con no_info y contacto, muestra el nombre y un enlace mailto', () => {
        renderMessage(assistant({ suggestedContact: CONTACT }));

        expect(screen.getByText('Consultá a quien puede ayudarte')).toBeInTheDocument();
        expect(screen.getByText(/Laura Pérez/)).toBeInTheDocument();
        expect(screen.getByRole('link', { name: CONTACT.email })).toHaveAttribute('href', `mailto:${CONTACT.email}`);
    });

    test('con no_info y sin contacto, no muestra el bloque', () => {
        renderMessage(assistant({}));

        expect(screen.queryByText('Consultá a quien puede ayudarte')).not.toBeInTheDocument();
    });

    test('una respuesta answered no muestra contacto aunque llegue', () => {
        renderMessage(assistant({ status: 'answered', text: 'El plazo es de 5 días.', suggestedContact: CONTACT }));

        expect(screen.queryByText('Consultá a quien puede ayudarte')).not.toBeInTheDocument();
    });

    test('mientras se genera sin texto, el indicador anuncia la búsqueda', () => {
        renderMessage(assistant({ status: 'streaming', text: '' }));

        expect(screen.getByText('Buscando en los documentos…')).toBeInTheDocument();
    });
});