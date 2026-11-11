// The versions of a procedure as a timeline (spec 015, R8): a dot with its word for the state, who
// published it and when, and the chip of a critical change with its summary. Only the view.
import { CHIP, StatusDot } from '@/components/documents/design';
import { formatCreatedAt } from '@/lib/documents/format';
import type { VersionHistoryItem } from '@/lib/procedures';
import { VERSION_LABELS, VERSION_TONES, newestFirst } from '@/lib/procedures/versions';

const plural = (count: number) => `${count} ${count === 1 ? 'paso' : 'pasos'}`;

// "Publicada el 10/11/2026, 09:00 por Ana"; a draft was only created.
function whenText(version: VersionHistoryItem): string {
  if (!version.publishedAt) return `Creada el ${formatCreatedAt(version.createdAt)}`;
  const by = version.publishedBy?.name ? ` por ${version.publishedBy.name}` : '';
  return `Publicada el ${formatCreatedAt(version.publishedAt)}${by}`;
}

export function VersionTimeline({ versions }: { versions: readonly VersionHistoryItem[] }) {
  return (
    <ol aria-label="Versiones" className="flex flex-col gap-5">
      {newestFirst(versions).map((version) => (
        <li key={version.id} className="flex min-w-0 flex-col gap-1 border-l-2 border-borde pl-4">
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-semibold">Versión {version.versionNumber}</span>
            <StatusDot tone={VERSION_TONES[version.status]}>{VERSION_LABELS[version.status]}</StatusDot>
            {version.isCritical && (
              <span className={`${CHIP} bg-durazno text-durazno-texto`}>Cambio crítico</span>
            )}
          </p>
          <p className="text-texto-suave">{whenText(version)}</p>
          {version.changeSummary && <p className="break-words">{version.changeSummary}</p>}
          <p className="text-texto-suave">{plural(version.stepCount)}</p>
        </li>
      ))}
    </ol>
  );
}
