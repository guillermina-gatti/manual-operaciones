// HU33: the procedure changed while the employee runs it. Shown every time the execution is
// loaded while the change is pending. Not critical: "Terminar con esta versión" (keeps going on
// the version it started with) or "Reiniciar con la nueva". Critical: only "Reiniciar con la
// nueva". An alert, so a screen reader announces it; the state is told with words, never only
// with the color of the box.
import { useId } from 'react';
import { BUTTON_PRIMARY, BUTTON_SECONDARY } from '@/components/documents/design';
import type { VersionChangeResponse } from '@/lib/api';

interface VersionChangeNoticeProps {
  change: VersionChangeResponse;
  restarting: boolean;
  onKeep: () => void;
  onRestart: () => void;
}

const BOX = {
  // Rosa, as "Se abandona": the execution cannot go on as it is.
  critical: 'border-rosa-alerta-texto/30 bg-rosa-alerta',
  // Durazno, as "Nuevo en v3": something new, the employee chooses.
  notCritical: 'border-durazno-texto/30 bg-durazno',
};

export function VersionChangeNotice({
  change,
  restarting,
  onKeep,
  onRestart,
}: VersionChangeNoticeProps) {
  const titleId = useId();
  const version =
    change.currentVersionNumber === null
      ? 'una versión nueva'
      : `la versión ${change.currentVersionNumber}`;

  return (
    <section
      role="alert"
      aria-labelledby={titleId}
      className={`flex flex-col gap-4 rounded-2xl border p-5 sm:p-6 ${
        change.critical ? BOX.critical : BOX.notCritical
      }`}
    >
      <div className="flex flex-col gap-2">
        <h2
          id={titleId}
          className={`text-xl font-bold ${
            change.critical ? 'text-rosa-alerta-texto' : 'text-durazno-texto'
          }`}
        >
          {change.critical
            ? 'El procedimiento tuvo un cambio crítico'
            : 'El procedimiento cambió'}
        </h2>
        <p className="text-texto">
          {change.critical
            ? `Mientras lo ejecutabas se publicó ${version} con un cambio crítico. Para seguir, reiniciá con la versión nueva: empieza desde el paso 1.`
            : `Mientras lo ejecutabas se publicó ${version}. Podés terminar con la versión con la que empezaste o reiniciar con la nueva, desde el paso 1.`}
        </p>
      </div>

      {change.changes.length > 0 && (
        <ul aria-label="Qué cambió" className="flex flex-col gap-1 text-texto">
          {change.changes.map((published) => (
            <li key={published.versionNumber} className="break-words">
              <span className="font-semibold">Versión {published.versionNumber}</span>
              {published.isCritical && <span className="font-semibold"> · Cambio crítico</span>}
              {' · '}
              {published.changeSummary?.trim() || 'Sin resumen del cambio'}
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          className={`${BUTTON_PRIMARY} w-full sm:w-auto`}
          disabled={restarting}
          onClick={onRestart}
        >
          {restarting ? 'Reiniciando…' : 'Reiniciar con la nueva'}
        </button>
        {!change.critical && (
          <button
            type="button"
            className={`${BUTTON_SECONDARY} w-full sm:w-auto`}
            disabled={restarting}
            onClick={onKeep}
          >
            Terminar con esta versión
          </button>
        )}
      </div>
    </section>
  );
}
