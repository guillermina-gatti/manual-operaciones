// Variante local del diseño para el listado de /documentos (prueba de la skill design-taste-frontend).
// design.tsx lo comparten métricas y chat, por eso estas piezas viven aparte: mismos tokens de
// globals.css, más la respuesta al puntero (sube al pasar, se hunde al tocar) y su versión quieta para
// quien pide menos movimiento.
import type { ReactNode } from 'react';
import { BUTTON_PRIMARY, CARD } from './design';

// Se hunde 1 px al apretar; sin movimiento si el sistema lo pide.
const PRESS = 'active:translate-y-px motion-reduce:active:translate-y-0';

export const LIST_BUTTON_PRIMARY = `${BUTTON_PRIMARY} ${PRESS} transition-[background-color,transform] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-naranja`;

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

// Título de la pantalla con su acción principal a la derecha (debajo, en el celular).
export function DocumentsHeader({ action }: { action?: ReactNode }) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex min-w-0 flex-col gap-2">
        <h1 className="text-3xl font-extrabold tracking-[-0.02em] text-bosque sm:text-[40px] sm:leading-tight">
          Documentos
        </h1>
        <p className="text-lg text-texto-suave">
          Los documentos vigentes de tus áreas. Buscá, descargá y revisá.
        </p>
      </div>
      {action && <div className="flex shrink-0">{action}</div>}
    </header>
  );
}
