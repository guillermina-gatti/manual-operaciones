'use client';

// HU25 (spec 009, Should): valorar una respuesta del asistente. Un selector "Sí / No" con el mismo
// patrón del selector de vista de Documentos (VIEW_SWITCH, aria-pressed). "Sí" manda la valoración
// de una vez; "No" abre un comentario opcional (máx. 500). La valoración no bloquea el chat: si falla,
// el texto de la respuesta queda igual y se puede volver a enviar.
import { useId, useState } from 'react';
import { VIEW_OPTION, VIEW_SWITCH } from '@/components/documents/list-design';
import { recordFeedback } from '@/lib/api';
import { BUTTON_SECONDARY } from './design';

const COMMENT_MAX = 500;

type Choice = 'useful' | 'not-useful';
type Status = 'idle' | 'sending' | 'sent' | 'error';

export function ChatFeedback({ messageId }: { messageId: string }) {
    const [choice, setChoice] = useState<Choice | null>(null);
    const [comment, setComment] = useState('');
    const [status, setStatus] = useState<Status>('idle');
    const questionId = useId();
    const commentId = useId();
    const sending = status === 'sending';

    // Una vez valorada, no se vuelve a votar en esta sesión.
    if (status === 'sent') {
        return (
            <p role="status" className="border-t border-borde pt-3 text-sm text-texto-suave">
                Gracias, tu valoración quedó guardada.
            </p>
        );
    }

    async function send(useful: boolean) {
        const trimmed = comment.trim();
        setStatus('sending');
        try {
            await recordFeedback(messageId, {
                useful,
                // Un comentario vacío no se manda; solo tiene sentido con "No".
                comment: !useful && trimmed ? trimmed : undefined,
            });
            setStatus('sent');
        } catch {
            setStatus('error');
        }
    }

    function choose(next: Choice) {
        setChoice(next);
        if (next === 'useful') void send(true);
    }

    return (
        <section aria-label="Valoración de la respuesta" className="flex flex-col gap-3 border-t border-borde pt-3">
            <p id={questionId} className="text-sm font-semibold text-texto">
                ¿Te sirvió esta respuesta?
            </p>

            <div role="group" aria-labelledby={questionId} className={`${VIEW_SWITCH} self-start`}>
                <button
                    type="button"
                    aria-pressed={choice === 'useful'}
                    disabled={sending}
                    onClick={() => choose('useful')}
                    className={`${VIEW_OPTION} disabled:cursor-not-allowed disabled:opacity-60`}
                >
                    Sí
                </button>
                <button
                    type="button"
                    aria-pressed={choice === 'not-useful'}
                    disabled={sending}
                    onClick={() => choose('not-useful')}
                    className={`${VIEW_OPTION} disabled:cursor-not-allowed disabled:opacity-60`}
                >
                    No
                </button>
            </div>

            {choice === 'not-useful' && (
                <div className="flex flex-col gap-2">
                    <label htmlFor={commentId} className="text-sm text-texto-suave">
                        Contanos qué faltó (opcional)
                    </label>
                    <textarea
                        id={commentId}
                        rows={3}
                        maxLength={COMMENT_MAX}
                        value={comment}
                        disabled={sending}
                        onChange={(event) => setComment(event.target.value)}
                        className="w-full rounded-xl border border-borde bg-blanco px-3 py-2 text-texto disabled:opacity-60"
                    />
                    <p className="text-xs text-texto-suave">{`${comment.length} de ${COMMENT_MAX} caracteres`}</p>
                    <button
                        type="button"
                        disabled={sending}
                        onClick={() => void send(false)}
                        className={`${BUTTON_SECONDARY} min-h-10 self-start px-4 text-sm`}
                    >
                        Enviar valoración
                    </button>
                </div>
            )}

            {sending && <p role="status" className="text-sm text-texto-suave">Enviando…</p>}
            {status === 'error' && (
                <p role="alert" className="text-sm font-semibold text-rosa-alerta-texto">
                    No pudimos guardar tu valoración. Probá de nuevo.
                </p>
            )}
        </section>
    );
}