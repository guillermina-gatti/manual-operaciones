'use client';

// El archivo de la carga (F2, F4): una zona para arrastrar y soltar, o para tocar y elegir. Debajo,
// la ficha del archivo elegido con "Quitar". Valida apenas se elige (E5), como FileField, que sigue
// siendo el campo de "Subir versión nueva".
//
// El <input type="file"> real sigue ahí: con la etiqueta "Archivo", visualmente oculto pero alcanzable
// con Tab (Enter o Espacio abren el selector), y el foco se ve en toda la zona. Lo que se suelta va a
// ese mismo input, así lo conserva si la carga falla (F4).
import { useId, useRef, useState } from 'react';
import type { ChangeEvent, DragEvent, MouseEvent } from 'react';
import { FieldError } from '@/components/ui/FieldError';
import { formatSize } from '@/lib/documents/format';
import { FILE_ACCEPT } from '@/lib/documents/upload-rules';
import { validateFile } from '@/lib/documents/validate-upload';
import { HINT } from './design';
import { DROP_ZONE, FileTypeIcon, LIST_BUTTON_SMALL } from './list-design';

interface FileDropFieldProps {
  file: File | null;
  // El error de la validación al elegir, o el que devolvió la API (413, 415).
  error?: string;
  onChange: (file: File | null, error: string | undefined) => void;
}

function UploadIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-8 text-bosque"
    >
      <path d="M12 15V4M7.5 8.5 12 4l4.5 4.5" />
      <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
    </svg>
  );
}

export function FileDropField({ file, error, onChange }: FileDropFieldProps) {
  const id = useId();
  const hintId = `${id}-ayuda`;
  const errorId = `${id}-error`;
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  // Se valida en el momento: un .docx o un archivo de 11 MB muestran el error sin esperar a enviar.
  function pick(chosen: File | null) {
    onChange(chosen, chosen ? validateFile(chosen) : undefined);
  }

  function choose(event: ChangeEvent<HTMLInputElement>) {
    pick(event.target.files?.[0] ?? null);
  }

  // Tocar la zona abre el selector. El clic que hace el propio input al abrirse no se repite.
  function openPicker(event: MouseEvent<HTMLDivElement>) {
    if (event.target === inputRef.current) return;
    inputRef.current?.click();
  }

  function drop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    const dropped = event.dataTransfer.files?.[0];
    if (!dropped) return;
    // El archivo va al mismo input (F4). En el navegador, files es una FileList y se puede asignar.
    const input = inputRef.current;
    if (input) {
      try {
        input.files = event.dataTransfer.files;
      } catch {
        // Un entorno sin FileList real (los tests): igual se avisa el archivo al formulario.
      }
    }
    pick(dropped);
  }

  function remove() {
    if (inputRef.current) inputRef.current.value = '';
    onChange(null, undefined);
  }

  return (
    <div className="flex min-w-0 flex-col gap-3">
      {/* La sección ya se titula "Archivo": la etiqueta del input queda solo para lectores. */}
      <label htmlFor={id} className="sr-only">
        Archivo
      </label>
      <div
        className={DROP_ZONE}
        data-dragging={dragging || undefined}
        data-invalid={error ? true : undefined}
        onClick={openPicker}
        onDragEnter={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => {
          // Solo al salir de la zona, no al pasar entre sus hijos.
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
        }}
        onDrop={drop}
      >
        {/* Sin value ni key: React no lo recrea al volver a dibujar, y conserva el archivo (F4). */}
        <input
          ref={inputRef}
          id={id}
          type="file"
          accept={FILE_ACCEPT}
          onChange={choose}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${hintId} ${errorId}` : hintId}
          className="sr-only"
        />
        <UploadIcon />
        <p className="font-semibold">
          Arrastrá el archivo acá <span className="font-normal text-texto-suave">o</span>{' '}
          <span className="text-bosque underline underline-offset-4">tocá para elegirlo</span>
        </p>
        <p id={hintId} className={HINT}>
          PDF, .txt o .md, hasta 10 MB.
        </p>
      </div>

      {file && (
        <div className="flex min-w-0 items-center gap-3 rounded-xl border border-borde bg-blanco px-3 py-2.5">
          <FileTypeIcon fileName={file.name} size="sm" />
          <span title={file.name} className="min-w-0 truncate font-semibold">
            {file.name}
          </span>
          <span className="shrink-0 text-sm text-texto-suave tabular-nums">
            {formatSize(file.size)}
          </span>
          {/* El nombre accesible sale del texto ("Quitar el archivo elegido"), sin aria-label. */}
          <button type="button" onClick={remove} className={`${LIST_BUTTON_SMALL} ml-auto shrink-0`}>
            Quitar <span className="sr-only">el archivo elegido</span>
          </button>
        </div>
      )}

      <FieldError id={errorId} message={error} />
    </div>
  );
}
