// Tarjetas grises mientras carga el listado. Ocupan lo mismo que las reales, así la pantalla no salta.
import { CARD } from './design';

const CARDS = 6;

export function DocumentListSkeleton() {
  return (
    <ul aria-hidden="true" className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: CARDS }, (_, index) => (
        <li key={index} className={`${CARD} flex animate-pulse flex-col gap-4 p-6`}>
          <div className="h-6 w-3/4 rounded-lg bg-borde" />
          <div className="h-4 w-1/2 rounded-lg bg-borde" />
          <div className="h-4 w-full rounded-lg bg-borde" />
          <div className="h-4 w-2/3 rounded-lg bg-borde" />
        </li>
      ))}
    </ul>
  );
}
