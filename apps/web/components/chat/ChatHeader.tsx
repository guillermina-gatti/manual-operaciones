// Cabecera del asistente (spec 009, F2): fondo celeste, el color del asistente, y su alcance.
// Sin "● Conectado" (no hay un estado real) ni el hornero (todavía no está en public).
export function ChatHeader() {
  return (
    <header className="flex flex-col gap-1 rounded-t-2xl bg-celeste px-6 py-5">
      <h1 className="text-2xl font-extrabold tracking-[-0.02em] text-bosque">El hornero</h1>
      <p className="text-texto">Responde solo con lo vigente de tus áreas y cita la fuente</p>
    </header>
  );
}
