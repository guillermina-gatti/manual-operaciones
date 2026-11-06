// Variante local del diseño para las pantallas de /documentos (listado y detalle), de la prueba de la
// skill design-taste-frontend. design.tsx lo comparten métricas y chat, por eso estas piezas viven
// aparte: mismos tokens de globals.css, más la respuesta al puntero (sube al pasar, se hunde al tocar) y
// su versión quieta para quien pide menos movimiento.
import type { ReactNode } from 'react';
import { BUTTON_DANGER, BUTTON_PRIMARY, BUTTON_SECONDARY, CARD } from './design';

// --- Botones ---------------------------------------------------------------------------------------

// Se hunde 1 px al apretar; sin movimiento si el sistema lo pide. Foco visible en naranja.
const RESPONSIVE_BUTTON =
  'active:translate-y-px motion-reduce:active:translate-y-0 transition-[background-color,transform] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-naranja';

export const LIST_BUTTON_PRIMARY = `${BUTTON_PRIMARY} ${RESPONSIVE_BUTTON}`;
export const LIST_BUTTON_SECONDARY = `${BUTTON_SECONDARY} ${RESPONSIVE_BUTTON}`;
export const LIST_BUTTON_DANGER = `${BUTTON_DANGER} ${RESPONSIVE_BUTTON}`;

// --- Tarjetas --------------------------------------------------------------------------------------

// La tarjeta del listado: toda la superficie lleva al detalle (el enlace del título se estira con
// after:inset-0). Al pasar sube 2 px, crece la sombra y el borde se oscurece; con foco, el contorno
// rodea la tarjeta entera.
export const LIST_CARD = [
  CARD,
  'relative transition-[transform,box-shadow,border-color] duration-200 ease-out',
  'hover:-translate-y-0.5 hover:border-bosque/30 hover:shadow-md',
  'motion-reduce:transition-none motion-reduce:hover:translate-y-0',
  'has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-2 has-[a:focus-visible]:outline-naranja',
].join(' ');

// El enlace del título, estirado sobre toda la tarjeta. Lo que tenga que quedar usable encima (otros
// enlaces, botones, texto para seleccionar) va dentro de LIST_CARD_LAYER.
export const LIST_CARD_LINK =
  'block truncate text-bosque outline-none after:absolute after:inset-0 after:rounded-2xl after:content-[""]';
export const LIST_CARD_LAYER = 'relative z-10';

// Una tarjeta quieta (sin enlace), con el mismo relleno que la del listado.
export const LIST_PANEL = `${CARD} p-6`;

// La etiqueta de un dato (dt): chica, en mayúscula, sobre el valor.
export const META_LABEL = 'text-xs font-semibold tracking-wide text-texto-suave uppercase';

// --- Encabezado ------------------------------------------------------------------------------------

interface PageHeaderProps {
  title: string;
  subtitle?: ReactNode;
  // Marcas junto al título (Vencido, Archivado…).
  meta?: ReactNode;
  // Una línea chica entre el título y el subtítulo.
  note?: ReactNode;
  // La acción principal: a la derecha desde sm:, debajo en el celular. Un único elemento.
  action?: ReactNode;
  // Títulos que vienen de datos (pueden ser largos): cortan palabras en vez de desbordar.
  wrap?: boolean;
}

const TITLE =
  'text-3xl font-extrabold tracking-[-0.02em] text-bosque sm:text-[40px] sm:leading-tight';
const SUBTITLE = 'text-lg text-texto-suave';
const join = (...classes: (string | false)[]) => classes.filter(Boolean).join(' ');

export function PageHeader({ title, subtitle, meta, note, action, wrap = false }: PageHeaderProps) {
  const heading = <h1 className={join(TITLE, wrap && 'min-w-0 break-words')}>{title}</h1>;
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex min-w-0 flex-col gap-2">
        {meta ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {heading}
            {meta}
          </div>
        ) : (
          heading
        )}
        {note}
        {subtitle && <p className={join(SUBTITLE, wrap && 'break-words')}>{subtitle}</p>}
      </div>
      {action && <div className="flex shrink-0">{action}</div>}
    </header>
  );
}

// El encabezado del listado.
export function DocumentsHeader({ action }: { action?: ReactNode }) {
  return (
    <PageHeader
      title="Documentos"
      subtitle="Los documentos vigentes de tus áreas. Buscá, descargá y revisá."
      action={action}
    />
  );
}
