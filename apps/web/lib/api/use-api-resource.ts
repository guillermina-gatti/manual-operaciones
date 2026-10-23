'use client';

// Pide un recurso a la API y expone su estado (plan 002, sección 5.2; D7).
// Una respuesta vieja nunca pisa a la nueva: cada resultado se guarda con el pedido que lo trajo,
// y solo se muestra si ese pedido es el actual.
import { useCallback, useEffect, useEffectEvent, useState } from 'react';

export type ResourceState<T> =
  | { status: 'idle'; data: undefined; error: null }
  | { status: 'loading'; data: undefined; error: null }
  | { status: 'success'; data: T; error: null }
  | { status: 'error'; data: undefined; error: unknown };

export type ApiResource<T> = ResourceState<T> & { reload: () => void };

// key: identifica qué se pide (por ejemplo, "documents?page=2"). Con null no se pide nada.
// fetcher: cómo se piden los datos. Recibe una señal para cancelar el pedido.
export function useApiResource<T>(
  key: string | null,
  fetcher: (signal: AbortSignal) => Promise<T>,
): ApiResource<T> {
  // Cada reload es un intento nuevo de la misma clave.
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{
    requestId: string;
    state: ResourceState<T>;
  } | null>(null);

  const requestId = `${attempt}:${key}`;

  // Siempre la versión más nueva de fetcher, sin que un fetcher nuevo dispare otro pedido.
  const fetchResource = useEffectEvent(fetcher);

  useEffect(() => {
    if (key === null) return;

    const controller = new AbortController();
    const settle = (state: ResourceState<T>) => {
      // Si el pedido ya no es el actual (cambió la clave, hubo un reload o se desmontó), se descarta.
      if (!controller.signal.aborted) setResult({ requestId, state });
    };

    fetchResource(controller.signal).then(
      (data) => settle({ status: 'success', data, error: null }),
      (error: unknown) => settle({ status: 'error', data: undefined, error }),
    );

    return () => controller.abort();
  }, [key, requestId]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  let state: ResourceState<T>;
  if (key === null) state = { status: 'idle', data: undefined, error: null };
  else if (result?.requestId === requestId) state = result.state;
  else state = { status: 'loading', data: undefined, error: null };

  return { ...state, reload };
}
