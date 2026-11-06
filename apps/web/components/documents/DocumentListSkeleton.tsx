// Tarjetas grises mientras carga el listado. Copian la forma de las reales (título, archivo, datos bajo
// una línea), así la pantalla no salta.
import { CARD } from './design';

const CARDS = 6;

export function DocumentListSkeleton() {
  return (
    <ul aria-hidden="true" className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: CARDS }, (_, index) => (
        <li
          key={index}
          className={`${CARD} flex animate-pulse flex-col gap-5 p-6 motion-reduce:animate-none`}
        >
          <div className="flex flex-col gap-2">
            <div className="h-6 w-3/4 rounded-lg bg-borde" />
            <div className="h-4 w-1/2 rounded-lg bg-borde" />
          </div>
          <div className="grid grid-cols-2 gap-4 border-t border-borde pt-4">
            <div className="col-span-2 h-4 w-2/3 rounded-lg bg-borde" />
            <div className="h-4 w-4/5 rounded-lg bg-borde" />
            <div className="h-4 w-4/5 rounded-lg bg-borde" />
            <div className="h-6 w-1/3 rounded-lg bg-borde" />
          </div>
        </li>
      ))}
    </ul>
  );
}
