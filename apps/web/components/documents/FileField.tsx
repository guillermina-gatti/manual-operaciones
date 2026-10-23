'use client';

// Campo del archivo del formulario de carga (F2, F4). El formulario guarda el archivo y el error;
// este campo valida apenas se elige (E5) y avisa los dos.
import { useId } from 'react';
import type { ChangeEvent } from 'react';
import { FieldError } from '@/components/ui/FieldError';
import { formatSize } from '@/lib/documents/format';
import { FILE_ACCEPT } from '@/lib/documents/upload-rules';
import { validateFile } from '@/lib/documents/validate-upload';

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
      <label htmlFor={id} className="font-medium">
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
        className="min-h-11 w-full text-sm file:mr-3 file:min-h-11 file:rounded-md file:border file:border-zinc-300 file:bg-white file:px-4 file:text-zinc-900 dark:file:border-zinc-600 dark:file:bg-zinc-900 dark:file:text-zinc-100"
      />
      <p id={hintId} className="text-sm text-zinc-600 dark:text-zinc-400">
        PDF, .txt o .md, hasta 10 MB.
      </p>
      {file && (
        <p className="flex min-w-0 gap-2 text-sm">
          <span title={file.name} className="truncate">
            {file.name}
          </span>
          <span className="shrink-0 text-zinc-600 dark:text-zinc-400">{formatSize(file.size)}</span>
        </p>
      )}
      <FieldError id={errorId} message={error} />
    </div>
  );
}
