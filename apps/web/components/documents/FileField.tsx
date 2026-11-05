'use client';

// Campo del archivo del formulario de carga (F2, F4). El formulario guarda el archivo y el error;
// este campo valida apenas se elige (E5) y avisa los dos.
import { useId } from 'react';
import type { ChangeEvent } from 'react';
import { FieldError } from '@/components/ui/FieldError';
import { formatSize } from '@/lib/documents/format';
import { FILE_ACCEPT } from '@/lib/documents/upload-rules';
import { validateFile } from '@/lib/documents/validate-upload';
import { FileBadge, HINT, LABEL } from './design';

interface FileFieldProps {
  file: File | null;
  // El error de la validación al elegir, o el que devolvió la API (413, 415).
  error?: string;
  onChange: (file: File | null, error: string | undefined) => void;
}

export function FileField({ file, error, onChange }: FileFieldProps) {
  const id = useId();
  const hintId = `${id}-ayuda`;
  const errorId = `${id}-error`;

  function choose(event: ChangeEvent<HTMLInputElement>) {
    const chosen = event.target.files?.[0] ?? null;
    // Se valida en el momento: un .docx o un archivo de 11 MB muestran el error sin esperar a enviar.
    onChange(chosen, chosen ? validateFile(chosen) : undefined);
  }

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className={LABEL}>
        Archivo
      </label>
      {/* Sin value ni key: React no lo recrea al volver a dibujar, y conserva el archivo elegido (F4). */}
      <input
        id={id}
        type="file"
        accept={FILE_ACCEPT}
        onChange={choose}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${hintId} ${errorId}` : hintId}
        className="min-h-12 w-full rounded-xl border border-dashed border-borde bg-blanco p-2 text-sm text-texto-suave file:mr-3 file:min-h-11 file:rounded-xl file:border file:border-bosque file:bg-blanco file:px-4 file:font-semibold file:text-bosque hover:file:bg-salvia aria-[invalid=true]:border-peligro"
      />
      <p id={hintId} className={HINT}>
        PDF, .txt o .md, hasta 10 MB.
      </p>
      {file && (
        <p className="flex min-w-0 items-center gap-2 text-sm">
          <FileBadge fileName={file.name} />
          <span title={file.name} className="truncate">
            {file.name}
          </span>
          <span className="shrink-0 text-texto-suave">{formatSize(file.size)}</span>
        </p>
      )}
      <FieldError id={errorId} message={error} />
    </div>
  );
}
