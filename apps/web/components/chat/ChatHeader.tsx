// Cabecera del asistente: fondo bosque, el logo del hornero, su alcance y "Nueva conversación".
// Sin "● Conectado" (no hay un estado real). El logo es decorativo: el nombre va en el texto.
import { HEADER_BUTTON } from './design';

export function ChatHeader({ onNewConversation }: { onNewConversation: () => void }) {
  return (
    <header className="flex flex-wrap items-center gap-4 rounded-t-2xl bg-bosque px-6 py-5">
      {/* eslint-disable-next-line @next/next/no-img-element -- SVG chico y estático: no necesita optimización */}
      <img src="/logo-hornero.svg" alt="" aria-hidden="true" width={48} height={48} className="size-12 shrink-0 rounded-xl" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <h1 className="text-2xl font-extrabold tracking-[-0.02em] text-blanco">El hornero</h1>
        <p className="text-sm text-salvia">Responde solo con lo vigente de tus áreas y cita la fuente</p>
      </div>
      <button type="button" className={HEADER_BUTTON} onClick={onNewConversation}>
        Nueva conversación
      </button>
    </header>
  );
}