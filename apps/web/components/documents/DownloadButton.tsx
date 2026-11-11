'use client';

// Botón "Descargar" del detalle (F8). El enlace firmado vence a los 5 minutos: se pide a la API
// en cada clic, se abre y se olvida. Nunca se pide al mostrar la pantalla ni se guarda.
import { useEffect, useRef, useState } from 'react';
import { ERROR_TEXT } from './design';
import { LIST_BUTTON_PRIMARY, LIST_BUTTON_SECONDARY, LIST_BUTTON_SMALL } from './list-design';
import { describeApiError, getDownloadUrl, getVersionDownloadUrl } from '@/lib/api';

interface DownloadButtonProps {
  documentId: string;
  // Spec 003 (R12): con versionId descarga esa versión del historial; sin él, la vigente.
  versionId?: string;
  // Nombre accesible, cuando hay varios "Descargar" en la pantalla ("Descargar la versión 2").
  label?: string;
  // Cómo se abre el enlace. Los tests pasan la suya: jsdom no deja reemplazar location.assign.
  openUrl?: (url: string) => void;
  // Secundario, para no llenar la pantalla de botones primarios.
  secondary?: boolean;
  // Solo el ícono, en un botón cuadrado de 44 px: el de cada fila de "Versiones". El nombre accesible
  // es `label` (pasalo siempre en este caso), y `title` lo muestra al pasar el puntero.
  icon?: boolean;
}

// location.assign y no window.open: los navegadores bloquean las ventanas que se abren después de un await.
// S3 responde con Content-Disposition: attachment, así que se descarga sin salir de la página.
const assignLocation = (url: string) => window.location.assign(url);

// Solo enlaces http(s): un "javascript:…" ejecutaría código al abrirlo.
function isWebUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === 'https:' || protocol === 'http:';
  } catch {
    return false;
  }
}

// Una flecha hacia una bandeja. Decorativa: el nombre va en el botón.
function DownloadIcon() {
  return (
    <svg
      aria-hidden="true"
      data-icon="download"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-5"
    >
      <path d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 19h14" />
    </svg>
  );
}

// Mientras se pide el enlace; quieto si se pide menos movimiento.
function SpinnerIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      className="size-5 animate-spin motion-reduce:animate-none"
    >
      <path d="M12 3a9 9 0 1 0 9 9" />
    </svg>
  );
}

export function DownloadButton({
  documentId,
  versionId,
  label,
  openUrl = assignLocation,
  secondary = false,
  icon = false,
}: DownloadButtonProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Corta un segundo clic que llegue antes de que React vuelva a dibujar el botón deshabilitado.
  const busyRef = useRef(false);
  const controllerRef = useRef<AbortController | null>(null);

  // Si la pantalla se cierra a mitad del pedido, se cancela y no se abre nada.
  useEffect(() => () => controllerRef.current?.abort(), []);

  async function download() {
    if (busyRef.current) return;
    busyRef.current = true;
    const controller = new AbortController();
    controllerRef.current = controller;
    setBusy(true);
    setError(null);

    try {
      const { url } = versionId
        ? await getVersionDownloadUrl(documentId, versionId, controller.signal)
        : await getDownloadUrl(documentId, controller.signal);
      if (controller.signal.aborted) return;
      if (!isWebUrl(url)) throw new Error('El enlace de descarga no es una dirección web');
      openUrl(url);
    } catch (caught) {
      if (controller.signal.aborted) return;
      setError(describeApiError(caught, 'download').message);
    } finally {
      busyRef.current = false;
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  let className = LIST_BUTTON_PRIMARY;
  if (icon) className = `${LIST_BUTTON_SMALL} size-11 px-0`;
  else if (secondary) className = LIST_BUTTON_SECONDARY;

  let content;
  if (icon) content = busy ? <SpinnerIcon /> : <DownloadIcon />;
  else content = busy ? 'Preparando…' : 'Descargar';

  return (
    <div className={`flex flex-col gap-2 ${icon ? 'items-end' : 'items-start'}`}>
      <button
        type="button"
        className={className}
        onClick={download}
        disabled={busy}
        aria-busy={busy}
        aria-label={label}
        title={icon ? (busy ? 'Preparando…' : label) : undefined}
      >
        {content}
      </button>
      {error && (
        // En una fila, junto al ícono: angosto y alineado a la derecha, para no empujar la fila.
        <p role="alert" className={icon ? `${ERROR_TEXT} max-w-56 text-right` : ERROR_TEXT}>
          {error}
        </p>
      )}
    </div>
  );
}
