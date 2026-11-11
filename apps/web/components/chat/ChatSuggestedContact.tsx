// HU19: a quién consultar cuando el asistente no encuentra información. Lo manda la API con no_info
// (chat-contact.ts); sin contacto no se muestra nada. El correo es un enlace mailto.
import { TEXT_LINK } from './design';

export function ChatSuggestedContact({ contact }: { contact?: { name: string; email: string } }) {
    if (!contact) return null;
    return (
        <div className="flex flex-col gap-1 rounded-xl bg-celeste px-4 py-3 text-texto">
            <p className="text-sm font-semibold text-bosque">Consultá a quien puede ayudarte</p>
            <p>
                {contact.name} ·{' '}
                <a href={`mailto:${contact.email}`} className={`${TEXT_LINK} break-all`}>
                    {contact.email}
                </a>
            </p>
        </div>
    );
}