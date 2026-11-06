// HU25: recordFeedback manda la valoración al mensaje, con el cliente de la API.
import { describe, expect, test, vi } from 'vitest';
import { createChatFeedbackApi } from '@/lib/api/chat-feedback';
import type { ApiClient } from '@/lib/api/client';

describe('recordFeedback (HU25)', () => {
    test('manda la valoración como JSON a la ruta del mensaje', async () => {
        const request = vi.fn().mockResolvedValue(undefined);
        const client: ApiClient = { request };

        await createChatFeedbackApi(client).recordFeedback('msg-1', { useful: false, comment: 'Falta un dato' });

        expect(request).toHaveBeenCalledWith('/api/chat/messages/msg-1/feedback', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ useful: false, comment: 'Falta un dato' }),
        });
    });

    test('escapa el id en la ruta', async () => {
        const request = vi.fn().mockResolvedValue(undefined);

        await createChatFeedbackApi({ request }).recordFeedback('a/b', { useful: true });

        expect(request.mock.calls[0][0]).toBe('/api/chat/messages/a%2Fb/feedback');
    });
});