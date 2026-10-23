// Tarjetas grises mientras carga el listado. Ocupan lo mismo que las reales, así la pantalla no salta.
const CARDS = 6;

export function DocumentListSkeleton() {
  return (
    <ul aria-hidden="true" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: CARDS }, (_, index) => (
        <li
          key={index}
          className="flex animate-pulse flex-col gap-3 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900"
        >
          <div className="h-6 w-3/4 rounded bg-zinc-200 dark:bg-zinc-700" />
          <div className="h-4 w-1/2 rounded bg-zinc-200 dark:bg-zinc-700" />
          <div className="h-4 w-full rounded bg-zinc-200 dark:bg-zinc-700" />
          <div className="h-4 w-2/3 rounded bg-zinc-200 dark:bg-zinc-700" />
        </li>
      ))}
    </ul>
  );
}
