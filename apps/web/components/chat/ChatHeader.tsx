// Cabecera del asistente (spec 009, F2): fondo celeste, el color del asistente, y su alcance.
// Sin "● Conectado" (no hay un estado real). La marca es decorativa: el nombre va en el texto.
export function ChatHeader() {
  return (
    <header className="flex items-center gap-4 rounded-t-2xl bg-celeste px-6 py-5">
      <span
        aria-hidden="true"
        className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-bosque text-xl text-blanco"
      >
        ✦
      </span>
      <div className="flex min-w-0 flex-col gap-1">
        <h1 className="text-2xl font-extrabold tracking-[-0.02em] text-bosque">El hornero</h1>
        <p className="text-texto">Responde solo con lo vigente de tus áreas y cita la fuente</p>
      </div>
    </header>
  );
}