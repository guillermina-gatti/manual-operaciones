'use client';

// Botón "Descargar" del detalle (F8). El enlace firmado vence a los 5 minutos: se pide a la API
// en cada clic, se abre y se olvida. Nunca se pide al mostrar la pantalla ni se guarda.
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { describeApiError, getDownloadUrl } from '@/lib/api';

interface DownloadButtonProps {
  documentId: string;
  // Cómo se abre el enlace. Los tests pasan la suya: jsdom no deja reemplazar location.assign.
  openUrl?: (url: string) => void;
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

export function DownloadButton({ documentId, openUrl = assignLocation }: DownloadButtonProps) {
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
      const { url } = await getDownloadUrl(documentId, controller.signal);
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

  return (
    <div className="flex flex-col items-start gap-2">
      <Button onClick={download} disabled={busy} aria-busy={busy}>
        {busy ? 'Preparando…' : 'Descargar'}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
