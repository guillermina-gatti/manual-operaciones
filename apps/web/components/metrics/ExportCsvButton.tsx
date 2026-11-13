'use client';

// "Exportar CSV": a secondary button next to the tabs of /metricas. The panel gives it the file to
// build (lib/metrics/csv.ts) or why there is nothing to export yet; it downloads it in the browser,
// with a Blob and a link that is gone right after. While the data load or when there are none, it
// says why (aria-disabled, so it stays in the Tab order with its reason). After the download,
// "Archivo descargado" in a polite live region; if the browser fails, a clear error.
import { useEffect, useId, useState } from 'react';
import { CheckIcon, DownloadIcon } from './icons';

export type ExportState =
  | { status: 'ready'; fileName: string; build: () => string }
  | { status: 'unavailable'; reason: string };

// Secondary, 44 px: bosque border and text on white.
const BUTTON =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-bosque bg-blanco px-4 font-semibold text-bosque transition-colors hover:bg-salvia focus-visible:outline-naranja motion-reduce:transition-none aria-disabled:cursor-not-allowed aria-disabled:border-borde aria-disabled:text-texto-suave aria-disabled:hover:bg-blanco';

// How long "Archivo descargado" stays.
const NOTICE_MS = 4000;

export function downloadFile(content: string, fileName: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.style.display = 'none';
    document.body.append(link);
    link.click();
    link.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function ExportCsvButton({
  state,
  download = downloadFile,
}: {
  state: ExportState;
  // The tests replace the download.
  download?: (content: string, fileName: string) => void;
}) {
  const reasonId = useId();
  const [notice, setNotice] = useState<{ kind: 'done' | 'error'; at: number } | null>(null);
  const disabled = state.status !== 'ready';

  useEffect(() => {
    if (notice?.kind !== 'done') return;
    const timer = setTimeout(() => setNotice(null), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  function onClick() {
    if (state.status !== 'ready') return;
    try {
      download(state.build(), state.fileName);
      setNotice({ kind: 'done', at: Date.now() });
    } catch {
      setNotice({ kind: 'error', at: Date.now() });
    }
  }

  return (
    <div className="flex flex-col items-stretch gap-1.5 sm:items-end">
      <button
        type="button"
        onClick={onClick}
        aria-disabled={disabled || undefined}
        aria-describedby={disabled ? reasonId : undefined}
        title={disabled ? state.reason : undefined}
        className={BUTTON}
      >
        <DownloadIcon className="size-4" />
        Exportar CSV
      </button>
      {disabled && (
        <span id={reasonId} className="text-[13px] text-texto-suave sm:text-right">
          {state.reason}
        </span>
      )}
      <span
        aria-live="polite"
        className="inline-flex items-center gap-1.5 self-start text-[13px] font-semibold text-bosque sm:self-end"
      >
        {notice?.kind === 'done' && (
          <>
            <CheckIcon className="size-4" />
            Archivo descargado
          </>
        )}
      </span>
      {notice?.kind === 'error' && (
        <span role="alert" className="text-[13px] font-semibold text-peligro sm:text-right">
          No se pudo descargar el archivo. Probá de nuevo o con otro navegador.
        </span>
      )}
    </div>
  );
}
