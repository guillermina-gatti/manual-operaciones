// Spec 011 (F2): el aviso de una respuesta conflict. Durazno, como las advertencias del diseño, con el
// ícono decorativo y el estado en el texto: nunca solo el color. No es un encabezado de la página (F3).
export const CONFLICT_TITLE = 'Dos documentos dicen cosas distintas';
export const CONFLICT_HINT = 'Revisá las dos fuentes antes de seguir. Le avisamos al administrador para que lo revise.';

export function ConflictNotice() {
  return (
    <div className="flex gap-2 rounded-xl bg-durazno px-4 py-3 text-durazno-texto">
      <span aria-hidden="true">⚠</span>
      <div className="flex flex-col gap-1">
        <p className="font-bold">{CONFLICT_TITLE}</p>
        <p>{CONFLICT_HINT}</p>
      </div>
    </div>
  );
}
