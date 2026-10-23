'use client';

// Hook para pedir un recurso a la API y gestionar su estado (carga, éxito, error, recarga).
// Garantiza que una respuesta vieja nunca pise a una nueva usando IDs de petición únicos.
import { useCallback, useEffect, useEffectEvent, useState } from 'react';

// Tipos posibles para el estado del recurso
export type ResourceState<T> =
  | { status: 'idle'; data: undefined; error: null }
  | { status: 'loading'; data: undefined; error: null }
  | { status: 'success'; data: T; error: null }
  | { status: 'error'; data: undefined; error: unknown };

// El hook devuelve el estado actual más una función para recargar los datos
export type ApiResource<T> = ResourceState<T> & { reload: () => void };

// Parámetros:
// - key: Identifica qué se pide (ej: "documents? page=2"). Si es null, no hace la petición.
// - fetcher: Función que realiza la llamada HTTP (recibe una señal de cancelación).
export function useApiResource<T>(
  key: string | null,
  fetcher: (signal: AbortSignal) => Promise<T>,
): ApiResource<T> {
  // Controla los reintentos manuales de la misma clave
  const [attempt, setAttempt] = useState(0);
  // Almacena el resultado asociado a un ID de petición específico
  const [result, setResult] = useState<{
    requestId: string;
    state: ResourceState<T>;
  } | null>(null);

  // Identificador único para este pedido actual
  const requestId = `${attempt}:${key}`;

  // Mantiene siempre la versión más fresca del fetcher sin disparar efectos colaterales innecesarios
  const fetchResource = useEffectEvent(fetcher);

  useEffect(() => {
    // Si no hay clave definida, no se hace ninguna petición
    if (key === null) return;

    const controller = new AbortController();

    // Función para actualizar el estado solo si la petición sigue vigente (no fue cancelada/reemplazada)
    const settle = (state: ResourceState<T>) => {
      if (!controller.signal.aborted) setResult({ requestId, state });
    };

    // Ejecutamos la petición en estado de carga
    fetchResource(controller.signal).then(
      (data) => settle({ status: 'success', data, error: null }),
      (error: unknown) => settle({ status: 'error', data: undefined, error }),
    );

    // Limpieza: Si cambia la clave o se desmonta el componente, se cancela la petición anterior
    return () => controller.abort();
  }, [key, requestId]);

  // Función para forzar una recarga incrementando el contador de intentos
  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  // Determinamos el estado visual que se retornará al componente
  let state: ResourceState<T>;
  if (key === null) state = { status: 'idle', data: undefined, error: null };
  else if (result?.requestId === requestId) state = result.state;
  else state = { status: 'loading', data: undefined, error: null }; // Si está cargando datos nuevos

  return { ...state, reload };
}
