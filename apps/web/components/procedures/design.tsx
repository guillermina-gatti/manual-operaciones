// Piezas del diseño pispIAr para las pantallas de Procedimientos (skill pispiar-design). Solo vista:
// usan los tokens de globals.css y no deciden nada de negocio. Los botones van como clases porque
// components/ui/Button es compartido y todavía usa los colores anteriores. El foco visible (anillo
// naranja) viene de globals.css.
import type { ComponentProps, ReactNode } from 'react';

// --- Botones (radio 12 px, 48 px de alto) ----------------------------------------------------------

const BUTTON_BASE =
  'inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-5 font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60';

export const BUTTON_PRIMARY = `${BUTTON_BASE} bg-bosque text-blanco hover:bg-bosque-hover`;
export const BUTTON_SECONDARY = `${BUTTON_BASE} border border-bosque bg-blanco text-bosque hover:bg-salvia`;
export const BUTTON_DANGER = `${BUTTON_BASE} border border-peligro bg-blanco text-peligro hover:bg-rosa-alerta`;

// Botones de solo ícono (48 px): siempre llevan aria-label. Deshabilitados, quedan en gris claro.
const ICON_BASE =
  'inline-flex size-12 shrink-0 items-center justify-center rounded-xl border border-borde bg-blanco transition-colors hover:bg-salvia disabled:cursor-not-allowed disabled:text-borde disabled:hover:bg-blanco';

export const BUTTON_ICON = `${ICON_BASE} text-bosque`;
export const BUTTON_ICON_DANGER = `${ICON_BASE} text-peligro`;

// Un link de acción (naranja-boton: contraste AA sobre blanco) y el de volver.
export const ACTION_LINK = 'font-semibold text-naranja-boton underline underline-offset-4';
export const BACK_LINK =
  'inline-flex min-h-11 items-center self-start font-semibold text-bosque underline-offset-4 hover:underline';

// --- Campos ----------------------------------------------------------------------------------------

export const INPUT =
  'min-h-12 w-full rounded-xl border border-borde bg-blanco px-4 py-3 text-texto aria-[invalid=true]:border-peligro disabled:opacity-60';
export const LABEL = 'font-semibold';
export const HINT = 'text-sm text-texto-suave';

// --- Página y tarjetas -----------------------------------------------------------------------------

// Título grande y la línea que explica la pantalla.
export function PageHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <header className="flex min-w-0 flex-col gap-2">
      <h1 className="break-words text-3xl font-extrabold tracking-[-0.02em] text-bosque sm:text-[40px] sm:leading-tight">
        {title}
      </h1>
      <p className="text-lg text-texto-suave">{subtitle}</p>
    </header>
  );
}

// Tarjeta: blanco, radio 16 px, borde de 1 px, sombra muy suave y relleno generoso.
export function Card({ className = '', ...rest }: ComponentProps<'section'>) {
  return (
    <section
      className={`flex min-w-0 flex-col gap-5 rounded-2xl border border-borde bg-blanco p-6 shadow-sm sm:p-8 ${className}`}
      {...rest}
    />
  );
}

export const CARD_TITLE = 'text-2xl font-bold text-texto';

// --- Chips, avisos y pasos -------------------------------------------------------------------------

export function AreaChip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-lg bg-chip-area px-3 py-1 text-sm font-semibold text-chip-area-texto">
      {children}
    </span>
  );
}

const NOTICE_TONES = {
  info: 'border-borde bg-salvia text-texto',
  error: 'border-peligro bg-rosa-alerta text-rosa-alerta-texto',
  success: 'border-transparent bg-chip-area text-chip-area-texto',
} as const;

// Un aviso con su texto. El role (note, alert o status) lo pone quien lo usa.
export function Notice({
  tone,
  className = '',
  ...rest
}: ComponentProps<'div'> & { tone: keyof typeof NOTICE_TONES }) {
  return (
    <div className={`rounded-xl border p-4 text-sm ${NOTICE_TONES[tone]} ${className}`} {...rest} />
  );
}

// Fila de un paso, el círculo con su número y la caja de "Agregar paso".
export const STEP_ROW = 'flex min-w-0 flex-col gap-4 rounded-xl bg-salvia p-4 sm:p-5';
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
      className="size-5"
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
