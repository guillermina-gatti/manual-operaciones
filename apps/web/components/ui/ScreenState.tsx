// Estados de una pantalla que no son "con datos": cargando, vacío y error (spec sección 7).
// Solo presentación: cada pantalla decide el texto.
import type { ReactNode } from 'react';
import { Button } from './Button';

type ScreenStateProps =
  // children: el esqueleto propio de la pantalla, si tiene.
  | { kind: 'loading'; label?: string; children?: ReactNode }
  // action: por ejemplo, el botón del ADMIN para cargar el primer documento.
  | { kind: 'empty'; message: string; action?: ReactNode }
  // onRetry: si se pasa, aparece "Reintentar".
  | { kind: 'error'; message: string; onRetry?: () => void };

export function ScreenState(props: ScreenStateProps) {
  if (props.kind === 'loading') {
    const label = props.label ?? 'Cargando…';
    return (
      <div role="status" aria-busy="true" aria-live="polite">
        {props.children ? (
          // Con esqueleto, el texto queda solo para lectores de pantalla.
          <>
            <p className="sr-only">{label}</p>
            {props.children}
          </>
        ) : (
          <p className="py-8 text-center text-zinc-600 dark:text-zinc-400">{label}</p>
        )}
      </div>
    );
  }

  if (props.kind === 'empty') {
    return (
      <div className="flex flex-col items-center gap-4 py-12 text-center">
        <p className="text-zinc-700 dark:text-zinc-300">{props.message}</p>
        {props.action}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 py-12 text-center">
      <p role="alert" className="text-red-700 dark:text-red-400">
        {props.message}
      </p>
      {props.onRetry && (
        <Button variant="secondary" onClick={props.onRetry}>
          Reintentar
        </Button>
      )}
    </div>
  );
}
