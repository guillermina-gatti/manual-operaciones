// "¡Procedimiento completado!": shown between the progress and the steps once the last step is
// finished. A status, so screen readers announce it. Salvia, as the design's success screen, with
// a border so it reads as a card on the app background; without the hornero for now.
import Link from 'next/link';
import { BUTTON_PRIMARY, BUTTON_SECONDARY } from '@/components/documents/design';
import { CheckIcon } from '@/components/metrics/icons';
import { formatDuration } from '@/lib/executions/format';

interface CompletedPanelProps {
  procedureName: string;
  // From the start of the execution to its end.
  totalDurationMs: number | null;
}

export function CompletedPanel({ procedureName, totalDurationMs }: CompletedPanelProps) {
  return (
    <section
      role="status"
      className="flex flex-col gap-6 rounded-2xl border border-bosque/15 bg-salvia p-6 sm:p-8"
    >
      <div className="flex items-start gap-4">
        <span
          aria-hidden="true"
          className="flex size-12 shrink-0 items-center justify-center rounded-full bg-exito text-blanco"
        >
          <CheckIcon className="size-7" />
        </span>
        <div className="flex min-w-0 flex-col gap-2">
          <h2 className="text-2xl font-extrabold tracking-[-0.01em] text-bosque sm:text-[28px]">
            ¡Procedimiento completado!
          </h2>
          <p className="text-lg leading-relaxed text-texto">
            Terminaste <strong className="font-bold">{procedureName}</strong> en{' '}
            {formatDuration(totalDurationMs)}. Quedó registrado.
          </p>
        </div>
      </div>
      <div className="flex flex-col gap-3 sm:ml-16 sm:flex-row">
        <Link href="/ejecuciones" className={BUTTON_PRIMARY}>
          Ver otro procedimiento
        </Link>
        <Link href="/" className={BUTTON_SECONDARY}>
          Volver al inicio
        </Link>
      </div>
    </section>
  );
}
