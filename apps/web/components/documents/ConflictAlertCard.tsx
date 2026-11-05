// Una alerta de documentos contradictorios (spec 011, F7): los dos documentos lado a lado, la pregunta
// que la disparó y las fechas. Abierta, con "Marcar como resuelta"; resuelta, con quién, cuándo y la
// nota. No muestra quién hizo la pregunta (D13).
import Link from 'next/link';
import type { ConflictAlert, ConflictAlertDocument } from '@/lib/api';
import { formatDay, formatPerson } from '@/lib/documents/format';
import { BUTTON_SECONDARY, CARD, CHIP, HINT, StatusDot } from './design';

interface ConflictAlertCardProps {
  alert: ConflictAlert;
  // Solo con una abierta: abre el diálogo de F8.
  onResolve?: () => void;
}

function DocumentSide({ document }: { document: ConflictAlertDocument }) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <Link
        href={`/documentos/${document.id}`}
        className="break-words text-xl font-bold text-bosque underline-offset-4 hover:underline"
      >
        {document.title}
      </Link>
      <p className={HINT}>
        v{document.versionNumber} · {document.section}
      </p>
      {/* R17: el estado va siempre con texto. */}
      <div className="flex flex-wrap gap-2 empty:hidden">
        {document.status === 'ARCHIVED' && <StatusDot tone="gris">Archivado</StatusDot>}
        {document.status === 'ACTIVE' && !document.isCurrentVersion && (
          <span className={`${CHIP} bg-durazno text-durazno-texto`}>Hay una versión nueva</span>
        )}
      </div>
    </div>
  );
}

// "Detectada el 05/11/2026 · Se detectó 3 veces · Última vez el 07/11/2026".
function detections(alert: ConflictAlert): string {
  const first = `Detectada el ${formatDay(alert.firstDetectedAt)}`;
  if (alert.occurrences <= 1) return first;
  return `${first} · Se detectó ${alert.occurrences} veces · Última vez el ${formatDay(alert.lastDetectedAt)}`;
}

export function ConflictAlertCard({ alert, onResolve }: ConflictAlertCardProps) {
  const [a, b] = alert.documents;
  return (
    <article className={`${CARD} flex flex-col gap-6 p-6 sm:p-8`}>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <DocumentSide document={a} />
        <DocumentSide document={b} />
      </div>

      <p className="flex flex-col gap-1">
        <span className="font-semibold">Pregunta que la disparó:</span>
        <span className="line-clamp-3 break-words" title={alert.question}>
          «{alert.question}»
        </span>
      </p>

      <p className={HINT}>{detections(alert)}</p>

      {alert.status === 'OPEN' ? (
        onResolve && (
          <button type="button" className={`${BUTTON_SECONDARY} self-start`} onClick={onResolve}>
            Marcar como resuelta
          </button>
        )
      ) : (
        <div className="flex flex-col gap-1">
          <p className="text-sm font-semibold">
            Resuelta el {alert.resolvedAt ? formatDay(alert.resolvedAt) : '—'} por {formatPerson(alert.resolvedBy)}
          </p>
          {alert.resolutionNote && (
            <p className="whitespace-pre-wrap break-words text-sm">Nota: {alert.resolutionNote}</p>
          )}
        </div>
      )}
    </article>
  );
}
