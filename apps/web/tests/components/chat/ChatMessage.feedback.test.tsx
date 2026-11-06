// HU25: la valoración aparece solo en las respuestas que se pueden valorar.
import { render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { ChatMessage } from '@/components/chat/ChatMessage';
import type { AssistantMessage } from '@/components/chat/chat-state';

const SOURCE = {
    documentId: 'doc-compras',
    documentTitle: 'Manual de compras',
    versionNumber: 2,
    section: 'Aprobaciones',
    chunkId: 'c1',
    validFrom: '2026-10-01',
    url: '',
};

function assistant(overrides: Partial<AssistantMessage>): AssistantMessage {
    return {
        id: 2,
        role: 'assistant',
        question: '¿Cuál es el plazo?',
        status: 'answered',
        text: 'El plazo es de 5 días [S1].',
        sources: [SOURCE],
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

const QUESTION = '¿Te sirvió esta respuesta?';

describe('ChatMessage: valoración (HU25)', () => {
    test('una respuesta con fuentes se puede valorar', () => {
        renderMessage(assistant({}));

        expect(screen.getByText(QUESTION)).toBeInTheDocument();
    });

    test('una respuesta con contradicción también se puede valorar', () => {
        renderMessage(assistant({ status: 'conflict' }));

        expect(screen.getByText(QUESTION)).toBeInTheDocument();
    });

    test('no_info no se valora: no hay respuesta que valorar', () => {
        renderMessage(assistant({ status: 'no_info', text: 'No encontré información suficiente.', sources: [] }));

        expect(screen.queryByText(QUESTION)).not.toBeInTheDocument();
    });

    test('ai_unavailable no se valora', () => {
        renderMessage(assistant({ status: 'ai_unavailable', text: 'El asistente no está disponible.', sources: [] }));

        expect(screen.queryByText(QUESTION)).not.toBeInTheDocument();
    });

    test('mientras se genera no se valora', () => {
        renderMessage(assistant({ status: 'streaming', text: 'El plazo', sources: [] }));

        expect(screen.queryByText(QUESTION)).not.toBeInTheDocument();
    });

    test('sin messageId no hay nada que valorar', () => {
        renderMessage(assistant({ messageId: undefined }));

        expect(screen.queryByText(QUESTION)).not.toBeInTheDocument();
    });
});