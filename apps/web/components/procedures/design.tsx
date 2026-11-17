// Piezas propias de las pantallas de Procedimientos: la fila de un paso, su número, los colores de las
// áreas, el recorrido de pasos y los íconos de línea. Los botones, los campos, los títulos y las tarjetas
// no se copian acá: se importan de components/documents/design.tsx y list-design.tsx (DESIGN.md 1 y 9).
// Lo compartido no se modifica: cuando hace falta otro estilo se pisa con clases propias (sufijo "!").
import type { ReactNode } from 'react';
import { CHIP } from '@/components/documents/design';
import { LIST_PANEL } from '@/components/documents/list-design';
import type { ProcedureAreaView } from '@/lib/api/procedure-view';
import { formatArea } from '@/lib/documents/format';

// Una sección de la pantalla de un procedimiento: la tarjeta con su título h2. SECTION_HEADING es el
// del editor y la ficha: verde bosque, sin rayita naranja (D7).
export const SECTION = `${LIST_PANEL} flex min-w-0 flex-col gap-5`;
export const SECTION_HEADING = 'text-xl font-bold text-bosque';

// Un botón secundario que al pasar el mouse se llena de verde bosque y sube (D16). Con movimiento
// reducido solo cambia el color (D20).
export const SECONDARY_LIFT =
  'transition-[background-color,color,transform] enabled:hover:-translate-y-0.5 enabled:hover:bg-bosque! enabled:hover:text-blanco! motion-reduce:enabled:hover:translate-y-0';

// Los botones de un paso (D9): blancos con borde; al pasar suben, crecen y se llenan. Un botón
// deshabilitado no reacciona (enabled:).
const STEP_LIFT =
  'transition-[background-color,color,transform] enabled:hover:-translate-y-0.5 enabled:hover:scale-105 enabled:hover:text-blanco! motion-reduce:enabled:hover:translate-y-0 motion-reduce:enabled:hover:scale-100';
export const STEP_BUTTON = `${STEP_LIFT} enabled:hover:bg-bosque!`;
export const STEP_BUTTON_DANGER = `${STEP_LIFT} enabled:hover:bg-peligro!`;

// Fila de un paso (solo la caja: quien la usa pone la distribución) y la caja de "Agregar paso", que
// es el propio formulario. Al pasar el mouse la fila se oscurece apenas y muestra un borde suave (D8).
export const STEP_ROW =
  'min-w-0 rounded-xl bg-salvia p-4 ring-1 ring-transparent transition-colors hover:bg-[#E7EFEA] hover:ring-bosque/15 sm:p-5';
export const ADD_BOX = 'flex flex-col gap-4 rounded-2xl border-2 border-dashed border-borde p-5';
export const ADD_BUTTON =
  'inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-bosque/40 px-5 font-semibold text-bosque transition-colors hover:border-bosque hover:bg-salvia disabled:cursor-not-allowed disabled:opacity-60';

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

// --- Color de cada área (D4) -------------------------------------------------------------------------

const TONES = [
  'bg-chip-area text-chip-area-texto',
  'bg-durazno text-durazno-texto',
  'bg-[#E3EDFC] text-[#1D4ED8]',
] as const;

// Ventas es durazno y Operaciones azul; las demás toman verde, durazno o azul según la suma de los
// códigos de las letras de su nombre (módulo 3): el mismo nombre da siempre el mismo color.
export function areaTone(name: string): string {
  const clean = name.trim();
  if (clean.toLowerCase() === 'ventas') return TONES[1];
  if (clean.toLowerCase() === 'operaciones') return TONES[2];
  return TONES[[...clean].reduce((sum, letter) => sum + (letter.codePointAt(0) ?? 0), 0) % 3];
}

// Un chip por área, con el color de su área y "(inactiva)" si corresponde. Entre chips, ", " solo para
// lectores de pantalla (igual que AreaChips de documentos, que no se usa para no tocar su código).
export function ColoredAreaChips({ areas }: { areas: ProcedureAreaView[] }) {
  if (areas.length === 0) return <>—</>;
  return (
    <span className="flex flex-wrap gap-2">
      {areas.map((area, index) => (
        <span key={`${area.id}-${index}`} className="inline-flex">
          {index > 0 && <span className="sr-only">, </span>}
          <span className={`${CHIP} ${areaTone(area.name)}`}>{formatArea(area)}</span>
        </span>
      ))}
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
export const IconPlus = () => <Svg d="M12 5v14M5 12h14" />;
export const IconPencil = () => <Svg d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />;
export const IconTrash = () => (
  <Svg d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6" />
);
