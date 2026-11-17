// The versions of a procedure as a timeline (spec 015, R8; spec 017, D14 and D15): each one is a rounded
// box without border, hung on the line with its dot. Its state is a filled chip with a mark (✓ ✎ ↺), then
// who published it and when, the steps, and the chip of a critical change with its summary. Only the view.
import { CHIP } from '@/components/documents/design';
import { formatCreatedAt } from '@/lib/documents/format';
import type { VersionHistoryItem } from '@/lib/procedures';
import { VERSION_LABELS, newestFirst } from '@/lib/procedures/versions';

// Published is green, a draft is blue and a replaced one is gray and beige.
const STATES = {
  PUBLISHED: { box: 'bg-chip-area', chip: 'bg-exito text-blanco', dot: 'bg-exito', mark: '✓' },
  DRAFT: { box: 'bg-[#EEF4FE]', chip: 'bg-[#1D4ED8] text-blanco', dot: 'bg-[#1D4ED8]', mark: '✎' },
  SUPERSEDED: { box: 'bg-fondo', chip: 'bg-[#ECE7DD] text-[#5F5747]', dot: 'bg-[#5F5747]', mark: '↺' },
} as const;

const plural = (count: number) => `${count} ${count === 1 ? 'paso' : 'pasos'}`;

// "Publicada el 10/11/2026, 09:00 por Ana"; a draft was only created.
function whenText(version: VersionHistoryItem): string {
  if (!version.publishedAt) return `Creada el ${formatCreatedAt(version.createdAt)}`;
  const by = version.publishedBy?.name ? ` por ${version.publishedBy.name}` : '';
  return `Publicada el ${formatCreatedAt(version.publishedAt)}${by}`;
}

export function VersionTimeline({ versions }: { versions: readonly VersionHistoryItem[] }) {
  return (
    <ol aria-label="Versiones" className="flex flex-col gap-4 border-l-2 border-borde pl-6">
      {newestFirst(versions).map((version) => {
        const state = STATES[version.status];
        return (
          <li
            key={version.id}
            className={`relative flex min-w-0 flex-col gap-1.5 rounded-2xl p-4 transition-transform hover:-translate-y-0.5 motion-reduce:transition-none motion-reduce:hover:translate-y-0 ${state.box}`}
          >
            <span
              aria-hidden="true"
              className={`absolute top-6 -left-[2.1rem] size-3 rounded-full ring-4 ring-blanco ${state.dot}`}
            />
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="font-semibold">Versión {version.versionNumber}</span>
              <span className={`${CHIP} gap-1.5 ${state.chip}`}>
                <span aria-hidden="true">{state.mark}</span> {VERSION_LABELS[version.status]}
              </span>
              {version.isCritical && (
                <span className={`${CHIP} gap-1.5 bg-naranja-boton text-blanco`}>
                  <span aria-hidden="true">⚠</span> Cambio crítico
                </span>
              )}
            </p>
            <p className="text-texto-suave">
              <span>{whenText(version)}</span> · <span>{plural(version.stepCount)}</span>
            </p>
            {version.changeSummary && (
              <p className="break-words rounded-xl bg-blanco p-3">{version.changeSummary}</p>
            )}
          </li>
        );
      })}
    </ol>
  );
}
