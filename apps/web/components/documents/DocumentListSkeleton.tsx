// Formas grises mientras carga un listado. Copian la forma de lo que va a aparecer, así la pantalla no
// salta: `card` (la tarjeta de /por-revisar, por defecto), `list` (filas de la vista Lista) y `tile`
// (la vista Tarjetas de /documentos).
import type { DocumentsView } from '@/lib/documents/view';
import { CARD } from './design';
import { ROW_GRID, ROW_PANEL } from './list-design';

export type SkeletonVariant = 'card' | 'list' | 'tile';

// La variante que corresponde a cada vista de /documentos.
export const skeletonFor = (view: DocumentsView): SkeletonVariant =>
  view === 'tarjetas' ? 'tile' : 'list';

const ITEMS = 6;
const PULSE = 'animate-pulse motion-reduce:animate-none';
const BAR = 'rounded-lg bg-borde';

export function DocumentListSkeleton({ variant = 'card' }: { variant?: SkeletonVariant }) {
  if (variant === 'list') {
    return (
      <div aria-hidden="true" className={`${ROW_PANEL} ${PULSE}`}>
        <div className={`hidden border-b border-borde bg-fondo px-4 py-3 md:grid ${ROW_GRID}`}>
          {Array.from({ length: 5 }, (_, index) => (
            <div key={index} className={`h-3 w-1/2 ${BAR}`} />
          ))}
        </div>
        <ul className="divide-y divide-borde">
          {Array.from({ length: ITEMS }, (_, index) => (
            <li key={index} className={`flex flex-col gap-2 px-4 py-3.5 ${ROW_GRID}`}>
              <div className="flex items-center gap-3">
                <div className="h-8 w-7 shrink-0 rounded-md bg-borde" />
                <div className={`h-4 w-2/3 ${BAR}`} />
              </div>
              <div className={`ml-10 h-3 w-3/4 md:hidden ${BAR}`} />
              <div className={`hidden h-6 w-20 md:block ${BAR}`} />
              <div className={`hidden h-4 w-4/5 md:block ${BAR}`} />
              <div className={`hidden h-4 w-3/5 md:block ${BAR}`} />
              <div className={`hidden h-4 w-1/2 md:block ${BAR}`} />
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (variant === 'tile') {
    return (
      <ul aria-hidden="true" className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: ITEMS }, (_, index) => (
          <li key={index} className={`${CARD} flex flex-col gap-4 p-5 ${PULSE}`}>
            <div className="flex items-start justify-between">
              <div className="h-16 w-14 rounded-lg bg-borde" />
              <div className={`h-5 w-8 ${BAR}`} />
            </div>
            <div className={`h-5 w-3/4 ${BAR}`} />
            <div className="flex flex-col gap-2">
              <div className={`h-3.5 w-2/3 ${BAR}`} />
              <div className={`h-3.5 w-1/2 ${BAR}`} />
            </div>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <ul aria-hidden="true" className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: ITEMS }, (_, index) => (
        <li key={index} className={`${CARD} flex flex-col gap-5 p-6 ${PULSE}`}>
          <div className="flex flex-col gap-2">
            <div className={`h-6 w-3/4 ${BAR}`} />
            <div className={`h-4 w-1/2 ${BAR}`} />
          </div>
          <div className="grid grid-cols-2 gap-4 border-t border-borde pt-4">
            <div className={`col-span-2 h-4 w-2/3 ${BAR}`} />
            <div className={`h-4 w-4/5 ${BAR}`} />
            <div className={`h-4 w-4/5 ${BAR}`} />
            <div className={`h-6 w-1/3 ${BAR}`} />
          </div>
        </li>
      ))}
    </ul>
  );
}
