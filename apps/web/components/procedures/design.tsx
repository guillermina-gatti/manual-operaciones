// Piezas propias de las pantallas de Procedimientos: la fila de un paso, su número y los íconos de
// línea. Los botones, los campos, los títulos y las tarjetas no se copian acá: se importan de
// components/documents/design.tsx y list-design.tsx (DESIGN.md 1 y 9).
import type { ReactNode } from 'react';

// Fila de un paso (solo la caja: quien la usa pone la distribución) y la caja de "Agregar paso", que
// es el propio formulario.
export const STEP_ROW = 'min-w-0 rounded-xl bg-fondo p-4 sm:p-5';
export const ADD_BOX = 'flex flex-col gap-4 rounded-2xl border-2 border-dashed border-borde p-5';

export function StepNumber({ children }: { children: ReactNode }) {
  return (
    <span
      aria-hidden="true"
      className="flex size-10 shrink-0 items-center justify-center rounded-full bg-bosque text-base font-bold text-blanco"
    >
      {children}
    </span>
  );
}

// --- Íconos de línea (decorativos: el botón que los lleva tiene aria-label) --------------------------

function Svg({ d }: { d: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="size-5 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={d} />
    </svg>
  );
}

export const IconUp = () => <Svg d="M12 19V5M5 12l7-7 7 7" />;
export const IconDown = () => <Svg d="M12 5v14M19 12l-7 7-7-7" />;
export const IconTrash = () => (
  <Svg d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6" />
);
