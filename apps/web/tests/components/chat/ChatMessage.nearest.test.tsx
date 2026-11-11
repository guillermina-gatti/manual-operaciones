// HU19: los documentos cercanos aparecen solo cuando no hay información.
import { render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { ChatMessage } from '@/components/chat/ChatMessage';
import type { AssistantMessage } from '@/components/chat/chat-state';

const NEAREST = [
    { documentId: 'doc-compras', documentTitle: 'Manual de compras' },
    { documentId: 'doc-gastos', documentTitle: 'Política de gastos' },
];

function assistant(overrides: Partial<AssistantMessage>): AssistantMessage {
    return {
        id: 2,
        role: 'assistant',
        question: '¿Cuál es el plazo?',
        status: 'no_info',
        text: 'No encontré información suficiente.',
        sources: [],
        messageId: 'msg-1',
        nearestDocuments: NEAREST,
        ...overrides,
    };
}

const renderMessage = (message: AssistantMessage) =>
    render(
        <ul>
            <ChatMessage message={message} onRetry={vi.fn()} busy={false} />
        </ul>,
    );

describe('ChatMessage: documentos cercanos (HU19)', () => {
    test('con no_info, los documentos son enlaces a su detalle', () => {
        renderMessage(assistant({}));

        expect(screen.getByText('Estos documentos pueden ayudarte')).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Manual de compras' })).toHaveAttribute('href', '/documentos/doc-compras');
        expect(screen.getByRole('link', { name: 'Política de gastos' })).toHaveAttribute('href', '/documentos/doc-gastos');
    });

    test('con no_info y sin documentos cercanos, queda solo el aviso', () => {
        renderMessage(assistant({ nearestDocuments: undefined }));

        expect(screen.getByText('No encontré información suficiente.')).toBeInTheDocument();
        expect(screen.queryByText('Estos documentos pueden ayudarte')).not.toBeInTheDocument();
    });

    test('con una lista vacía tampoco se muestra el título', () => {
        renderMessage(assistant({ nearestDocuments: [] }));

        expect(screen.queryByText('Estos documentos pueden ayudarte')).not.toBeInTheDocument();
    });

    test('una respuesta answered no los muestra', () => {
        renderMessage(assistant({ status: 'answered', text: 'El plazo es de 5 días.' }));

        expect(screen.queryByText('Estos documentos pueden ayudarte')).not.toBeInTheDocument();
    });
});